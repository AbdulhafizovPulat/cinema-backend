import { Router, Response } from 'express';
import { eq, and, like, sql, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { movies, purchases, userSubscriptions, ratings, users, categories } from '../../db/schema.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * Вспомогательная функция для проверки прав доступа пользователя к фильму.
 */
async function checkStreamAccess(userId: number, role: string, movie: any): Promise<boolean> {
  if (role === 'admin') return true;
  if (!movie.isPremium) return true;

  // Проверяем прямую покупку фильма
  const directPurchase = await db.select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.movieId, movie.id),
        eq(purchases.status, 'completed')
      )
    )
    .get();
  if (directPurchase) return true;

  // Проверяем активную подписку
  const now = new Date().toISOString();
  const activeSubs = await db.select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .all();
  return activeSubs.some((sub: any) => sub.expiresAt > now);
}

/**
 * GET /api/movies
 * Получение списка фильмов с фильтрацией, пагинацией, категориями и сортировкой.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: фильмов на странице (ENUM: 10, 20, 50, по умолчанию 10)
 * - title: фильтр по названию (частичное совпадение)
 * - author: фильтр по режиссеру / автору (частичное совпадение)
 * - tag: фильтр по одному из тегов
 * - categoryName: фильтр по названию категории (частичное совпадение)
 * - isPremium: true/false для разделения бесплатного и премиум каталога
 * - sortBy: поле для сортировки (например, "rating" для сортировки по оценкам, "createdAt" для новинок)
 * - sortOrder: направление сортировки ("asc" или "desc", по умолчанию "desc")
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    
    // Валидируем pageSize: должен быть строго enum (10, 20, 50). Иначе сбрасываем на 10.
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    
    const offset = (page - 1) * pageSize;

    const titleFilter = req.query.title as string;
    const authorFilter = req.query.author as string;
    const tagFilter = req.query.tag as string;
    const categoryNameFilter = req.query.categoryName as string;
    const isPremiumFilter = req.query.isPremium as string;
    const sortBy = req.query.sortBy as string; // 'rating' или 'createdAt'
    const sortOrder = req.query.sortOrder as string || 'desc';

    const conditions = [];

    if (titleFilter) {
      conditions.push(like(movies.title, `%${titleFilter}%`));
    }
    if (authorFilter) {
      conditions.push(like(movies.author, `%${authorFilter}%`));
    }
    if (categoryNameFilter) {
      conditions.push(like(categories.name, `%${categoryNameFilter}%`));
    }
    if (tagFilter) {
      // Ищем тег внутри JSON-массива (формат: '["Action", "Sci-Fi"]')
      conditions.push(like(movies.tags, `%"${tagFilter}"%`));
    }
    if (isPremiumFilter !== undefined) {
      conditions.push(eq(movies.isPremium, isPremiumFilter === 'true'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Определяем сортировку
    let orderByExpression;
    if (sortBy === 'rating') {
      orderByExpression = sortOrder === 'asc' ? asc(sql`averageRating`) : desc(sql`averageRating`);
    } else {
      orderByExpression = sortOrder === 'asc' ? asc(movies.createdAt) : desc(movies.createdAt);
    }

    // Запрос фильмов с подсчетом средней оценки, количества отзывов и JOIN'ом категории
    const moviesList = await db.select({
      id: movies.id,
      title: movies.title,
      description: movies.description,
      videoUrl: movies.videoUrl,
      isPremium: movies.isPremium,
      author: movies.author,
      tags: movies.tags,
      categoryId: movies.categoryId,
      categoryName: categories.name, // Название категории из связанной таблицы
      createdAt: movies.createdAt,
      averageRating: sql<number>`ROUND(COALESCE(AVG(${ratings.rating}), 0), 1)`,
      ratingCount: sql<number>`COUNT(${ratings.rating})`,
    })
    .from(movies)
    .leftJoin(ratings, eq(movies.id, ratings.movieId))
    .leftJoin(categories, eq(movies.categoryId, categories.id))
    .where(whereClause)
    .groupBy(movies.id)
    .orderBy(orderByExpression)
    .limit(pageSize)
    .offset(offset)
    .all();

    // Получаем общее количество записей для пагинации
    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(movies)
      .where(whereClause)
      .get();
      
    const totalItems = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Распарсим JSON-строку тегов для каждого фильма в нормальный массив
    const formattedMovies = moviesList.map((movie: any) => {
      let parsedTags = [];
      try {
        parsedTags = JSON.parse(movie.tags || '[]');
      } catch (e) {
        parsedTags = [];
      }
      
      const categoryObj = movie.categoryId ? { id: movie.categoryId, name: movie.categoryName } : null;

      return {
        id: movie.id,
        title: movie.title,
        description: movie.description,
        videoUrl: movie.videoUrl,
        isPremium: movie.isPremium,
        author: movie.author,
        tags: parsedTags,
        category: categoryObj, // Форматируем связь с категорией в виде объекта {id, name}
        averageRating: movie.averageRating,
        ratingCount: movie.ratingCount,
        createdAt: movie.createdAt,
      };
    });

    const isEmpty = formattedMovies.length === 0;

    return res.json({
      items: formattedMovies,
      page,
      pageSize,
      totalPages,
      totalResults: totalItems
    });
  } catch (error) {
    console.error('Ошибка получения каталога фильмов с пагинацией:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/movies/:id
 * Подробная информация о фильме (Detailed Movie Endpoint).
 * Возвращает: данные фильма, категорию, средний рейтинг, список всех отзывов
 * и статус `hasAccess` (разрешен ли стриминг текущему юзеру).
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const movieId = parseInt(req.params.id);
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const user = req.user!;

    // Находим фильм и подтягиваем его категорию
    const movieData = await db.select({
      id: movies.id,
      title: movies.title,
      description: movies.description,
      videoUrl: movies.videoUrl,
      isPremium: movies.isPremium,
      author: movies.author,
      tags: movies.tags,
      categoryId: movies.categoryId,
      categoryName: categories.name,
      createdAt: movies.createdAt,
    })
    .from(movies)
    .leftJoin(categories, eq(movies.categoryId, categories.id))
    .where(eq(movies.id, movieId))
    .get();

    if (!movieData) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    // Рассчитываем средний рейтинг фильма
    const ratingStats = await db.select({
      averageRating: sql<number>`ROUND(COALESCE(AVG(${ratings.rating}), 0), 1)`,
      ratingCount: sql<number>`COUNT(${ratings.rating})`,
    })
    .from(ratings)
    .where(eq(ratings.movieId, movieId))
    .get();

    // Получаем список всех оценок и комментариев пользователей
    const allRatings = await db.select({
      id: ratings.id,
      rating: ratings.rating,
      comment: ratings.comment,
      createdAt: ratings.createdAt,
      userEmail: users.email,
    })
    .from(ratings)
    .leftJoin(users, eq(ratings.userId, users.id))
    .where(eq(ratings.movieId, movieId))
    .all();

    // Проверяем, есть ли у текущего пользователя доступ к просмотру
    const hasAccess = await checkStreamAccess(user.id, user.role, movieData);

    // Парсим теги
    let parsedTags = [];
    try {
      parsedTags = JSON.parse(movieData.tags || '[]');
    } catch (e) {
      parsedTags = [];
    }

    const categoryObj = movieData.categoryId ? { id: movieData.categoryId, name: movieData.categoryName } : null;

    return res.json({
      movie: {
        id: movieData.id,
        title: movieData.title,
        description: movieData.description,
        videoUrl: movieData.videoUrl,
        isPremium: movieData.isPremium,
        author: movieData.author,
        tags: parsedTags,
        category: categoryObj,
        createdAt: movieData.createdAt,
      },
      ratings: {
        averageRating: ratingStats?.averageRating || 0,
        ratingCount: ratingStats?.ratingCount || 0,
        list: allRatings
      },
      userAccess: {
        hasAccess,
        message: hasAccess ? 'Просмотр разрешен' : 'Необходима подписка или покупка'
      }
    });
  } catch (error) {
    console.error('Ошибка получения подробной информации о фильме:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/movies/:id/rate
 * Возможность оценить фильм и оставить комментарий/отзыв (от 1 до 10).
 */
router.post('/:id/rate', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const movieId = parseInt(req.params.id);
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const { rating, comment } = req.body;
    const ratingValue = parseInt(rating);

    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 10) {
      return res.status(400).json({ error: 'Оценка должна быть целым числом в диапазоне от 1 до 10' });
    }

    // Проверяем существование фильма
    const movie = await db.select().from(movies).where(eq(movies.id, movieId)).get();
    if (!movie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    const userId = req.user!.id;

    // Ищем, оценивал ли юзер уже этот фильм (для апдейта/upsert)
    const existingRating = await db.select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.movieId, movieId)))
      .get();

    let result;
    if (existingRating) {
      // Обновляем оценку
      result = await db.update(ratings)
        .set({
          rating: ratingValue,
          comment: comment || null,
          createdAt: new Date().toISOString()
        })
        .where(eq(ratings.id, existingRating.id))
        .returning();
    } else {
      // Создаем новую оценку
      result = await db.insert(ratings).values({
        userId,
        movieId,
        rating: ratingValue,
        comment: comment || null,
      }).returning();
    }

    return res.status(200).json({
      message: 'Ваша оценка успешно сохранена',
      rating: result[0]
    });
  } catch (error) {
    console.error('Ошибка выставления оценки фильму:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/movies
 * Создание фильма (Admin only). Поддерживает опциональную привязку categoryId.
 */
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { title, description, videoUrl, isPremium, author, tags, categoryId } = req.body;

    if (!title || !description || !videoUrl) {
      return res.status(400).json({ error: 'Поля title, description и videoUrl обязательны' });
    }

    // Проверяем, существует ли указанная категория, если она передана
    let parsedCategoryId: number | null = null;
    if (categoryId !== undefined && categoryId !== null) {
      const catId = parseInt(categoryId);
      if (!isNaN(catId)) {
        const catCheck = await db.select().from(categories).where(eq(categories.id, catId)).get();
        if (!catCheck) {
          return res.status(400).json({ error: 'Указанная категория не существует' });
        }
        parsedCategoryId = catId;
      }
    }

    // Сериализуем массив тегов в строку JSON
    const serializedTags = Array.isArray(tags) ? JSON.stringify(tags) : '[]';

    const result = await db.insert(movies).values({
      title,
      description,
      videoUrl,
      isPremium: !!isPremium,
      author: author || 'Неизвестный автор',
      tags: serializedTags,
      categoryId: parsedCategoryId
    }).returning();

    return res.status(201).json({
      message: 'Фильм успешно добавлен',
      movie: {
        ...result[0],
        tags: Array.isArray(tags) ? tags : []
      },
    });
  } catch (error) {
    console.error('Ошибка добавления фильма:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/movies/:id
 * Редактирование информации о фильме (Admin only). Поддерживает опциональное изменение categoryId.
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const movieId = parseInt(req.params.id);
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const { title, description, videoUrl, isPremium, author, tags, categoryId } = req.body;

    const existingMovie = await db.select().from(movies).where(eq(movies.id, movieId)).get();
    if (!existingMovie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    // Проверяем категорию при обновлении
    let parsedCategoryId: number | null | undefined = undefined;
    if (categoryId !== undefined) {
      if (categoryId === null) {
        parsedCategoryId = null;
      } else {
        const catId = parseInt(categoryId);
        if (!isNaN(catId)) {
          const catCheck = await db.select().from(categories).where(eq(categories.id, catId)).get();
          if (!catCheck) {
            return res.status(400).json({ error: 'Указанная категория не существует' });
          }
          parsedCategoryId = catId;
        }
      }
    }

    const serializedTags = Array.isArray(tags) ? JSON.stringify(tags) : existingMovie.tags;

    const updated = await db.update(movies)
      .set({
        title: title !== undefined ? title : existingMovie.title,
        description: description !== undefined ? description : existingMovie.description,
        videoUrl: videoUrl !== undefined ? videoUrl : existingMovie.videoUrl,
        isPremium: isPremium !== undefined ? !!isPremium : existingMovie.isPremium,
        author: author !== undefined ? author : existingMovie.author,
        tags: serializedTags,
        categoryId: parsedCategoryId !== undefined ? parsedCategoryId : existingMovie.categoryId,
      })
      .where(eq(movies.id, movieId))
      .returning();

    let finalTags = [];
    try {
      finalTags = JSON.parse(updated[0].tags || '[]');
    } catch (e) { }

    return res.json({
      message: 'Информация о фильме успешно обновлена',
      movie: {
        ...updated[0],
        tags: finalTags
      },
    });
  } catch (error) {
    console.error('Ошибка обновления фильма:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/movies/:id
 * Удаление фильма.
 */
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const movieId = parseInt(req.params.id);
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const existingMovie = await db.select().from(movies).where(eq(movies.id, movieId)).get();
    if (!existingMovie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    await db.delete(movies).where(eq(movies.id, movieId));

    return res.json({ message: 'Фильм успешно удален' });
  } catch (error) {
    console.error('Ошибка удаления фильма:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/movies/:id/stream
 * Защищенный стриминг фильма.
 */
router.get('/:id/stream', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const movieId = parseInt(req.params.id);
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const movie = await db.select().from(movies).where(eq(movies.id, movieId)).get();
    if (!movie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    const user = req.user!;
    const hasAccess = await checkStreamAccess(user.id, user.role, movie);

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Для просмотра этого фильма необходима активная подписка или прямая покупка фильма.',
      });
    }

    return res.json({
      message: 'Доступ разрешен',
      videoUrl: movie.videoUrl,
    });
  } catch (error) {
    console.error('Ошибка проверки прав доступа к видео:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
