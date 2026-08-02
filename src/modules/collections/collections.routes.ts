import { Router, Response, Request } from 'express';
import { eq, and, sql, asc, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { collections, collectionMovies, movies, categories, ratings } from '../../db/schema.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * Вспомогательная функция для формирования списка фильмов с категорей и оценками
 */
async function fetchCollectionMovies(collectionId: number) {
  const items = await db.select({
    id: movies.id,
    title: movies.title,
    description: movies.description,
    posterUrl: movies.posterUrl,
    videoUrl: movies.videoUrl,
    isPremium: movies.isPremium,
    author: movies.author,
    tags: movies.tags,
    categoryId: movies.categoryId,
    categoryName: categories.name,
    order: collectionMovies.order,
    createdAt: movies.createdAt,
    averageRating: sql<number>`ROUND(COALESCE(AVG(${ratings.rating}), 0), 1)`,
    ratingCount: sql<number>`COUNT(${ratings.rating})`,
  })
  .from(collectionMovies)
  .innerJoin(movies, eq(collectionMovies.movieId, movies.id))
  .leftJoin(categories, eq(movies.categoryId, categories.id))
  .leftJoin(ratings, eq(movies.id, ratings.movieId))
  .where(eq(collectionMovies.collectionId, collectionId))
  .groupBy(movies.id, collectionMovies.order)
  .orderBy(asc(collectionMovies.order))
  .all();

  return items.map((movie: any) => {
    let parsedTags = [];
    try {
      parsedTags = JSON.parse(movie.tags || '[]');
    } catch (e) { }

    const categoryObj = movie.categoryId ? { id: movie.categoryId, name: movie.categoryName } : null;

    return {
      id: movie.id,
      title: movie.title,
      description: movie.description,
      posterUrl: movie.posterUrl,
      videoUrl: movie.videoUrl,
      isPremium: movie.isPremium,
      author: movie.author,
      tags: parsedTags,
      category: categoryObj,
      order: movie.order,
      averageRating: movie.averageRating,
      ratingCount: movie.ratingCount,
      createdAt: movie.createdAt,
    };
  });
}

/**
 * GET /api/collections
 * Публичный эндпоинт получения подборок фильмов для главной страницы клиента.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: подборок на странице (ENUM: 10, 20, 50, по умолчанию 10)
 * - slug: фильтр по уникальному слагу подборки (например: "top-movies", "golden-classics")
 */
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    const slugFilter = req.query.slug as string;

    const conditions = [eq(collections.isActive, true)];

    if (slugFilter) {
      conditions.push(eq(collections.slug, slugFilter));
    }

    const whereClause = and(...conditions);

    const collectionsList = await db.select()
      .from(collections)
      .where(whereClause)
      .orderBy(asc(collections.order), desc(collections.createdAt))
      .limit(pageSize)
      .offset(offset)
      .all();

    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(collections)
      .where(whereClause)
      .get();

    const totalItems = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Загружаем фильмы для каждой подборки
    const formattedCollections = await Promise.all(
      collectionsList.map(async (col: any) => {
        let parsedLocales = [];
        try {
          parsedLocales = JSON.parse(col.locales || '[]');
        } catch (e) { }

        const colMovies = await fetchCollectionMovies(col.id);

        return {
          id: col.id,
          title: col.title,
          slug: col.slug,
          description: col.description,
          locales: parsedLocales,
          order: col.order,
          isActive: col.isActive,
          movies: colMovies,
          movieCount: colMovies.length,
          createdAt: col.createdAt,
        };
      })
    );

    return res.json({
      items: formattedCollections,
      page,
      pageSize,
      totalPages,
      totalResults: totalItems,
    });
  } catch (error) {
    console.error('Ошибка при получении коллекций:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/collections/slug/:slug
 * Получение отдельной подборки фильмов по ее слагу.
 */
router.get('/slug/:slug', async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug } = req.params;

    const col = await db.select()
      .from(collections)
      .where(and(eq(collections.slug, slug), eq(collections.isActive, true)))
      .get();

    if (!col) {
      return res.status(404).json({ error: 'Подборка фильмов не найдена' });
    }

    let parsedLocales = [];
    try {
      parsedLocales = JSON.parse(col.locales || '[]');
    } catch (e) { }

    const colMovies = await fetchCollectionMovies(col.id);

    return res.json({
      id: col.id,
      title: col.title,
      slug: col.slug,
      description: col.description,
      locales: parsedLocales,
      order: col.order,
      isActive: col.isActive,
      movies: colMovies,
      movieCount: colMovies.length,
      createdAt: col.createdAt,
    });
  } catch (error) {
    console.error('Ошибка при получении коллекции по слагу:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/collections/admin/all
 * Список всех подборок для администратора (включая неактивные).
 */
router.get('/admin/all', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const collectionsList = await db.select()
      .from(collections)
      .orderBy(asc(collections.order), desc(collections.createdAt))
      .all();

    const formattedCollections = await Promise.all(
      collectionsList.map(async (col: any) => {
        let parsedLocales = [];
        try {
          parsedLocales = JSON.parse(col.locales || '[]');
        } catch (e) { }

        const colMovies = await fetchCollectionMovies(col.id);

        return {
          id: col.id,
          title: col.title,
          slug: col.slug,
          description: col.description,
          locales: parsedLocales,
          order: col.order,
          isActive: col.isActive,
          movies: colMovies,
          movieIds: colMovies.map((m: any) => m.id),
          movieCount: colMovies.length,
          createdAt: col.createdAt,
        };
      })
    );

    return res.json({ items: formattedCollections, total: formattedCollections.length });
  } catch (error) {
    console.error('Ошибка при получении подборок для админ-панели:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/collections/:id
 * Получение подробной информации о подборке по ID.
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const colId = parseInt(req.params.id);
    if (isNaN(colId)) {
      return res.status(400).json({ error: 'Неверный ID коллекции' });
    }

    const col = await db.select().from(collections).where(eq(collections.id, colId)).get();

    if (!col) {
      return res.status(404).json({ error: 'Подборка фильмов не найдена' });
    }

    let parsedLocales = [];
    try {
      parsedLocales = JSON.parse(col.locales || '[]');
    } catch (e) { }

    const colMovies = await fetchCollectionMovies(col.id);

    return res.json({
      id: col.id,
      title: col.title,
      slug: col.slug,
      description: col.description,
      locales: parsedLocales,
      order: col.order,
      isActive: col.isActive,
      movies: colMovies,
      movieIds: colMovies.map((m: any) => m.id),
      movieCount: colMovies.length,
      createdAt: col.createdAt,
    });
  } catch (error) {
    console.error('Ошибка при получении коллекции по ID:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/collections
 * Создание новой подборки фильмов (Admin only).
 * Body:
 * - title: название (например "Топ фильмы", "Золотая классика")
 * - slug: уникальный слаг (опционально)
 * - description: описание (опционально)
 * - locales: массив локализаций (опционально)
 * - order: порядок отображения (опционально, по умолчанию 0)
 * - isActive: активность (по умолчанию true)
 * - movieIds: массив ID фильмов для включения в подборку (опционально)
 */
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { title, slug, description, locales, order, isActive, movieIds } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Название подборки обязательно' });
    }

    // Генерируем слаг, если не передан
    const generatedSlug = slug && typeof slug === 'string' && slug.trim() !== ''
      ? slug.trim().toLowerCase().replace(/\s+/g, '-')
      : title.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

    // Проверяем уникальность слага
    const existingSlug = await db.select().from(collections).where(eq(collections.slug, generatedSlug)).get();
    if (existingSlug) {
      return res.status(400).json({ error: `Подборка со слагом "${generatedSlug}" уже существует` });
    }

    const serializedLocales = Array.isArray(locales) ? JSON.stringify(locales) : '[]';

    const result = await db.insert(collections).values({
      title: title.trim(),
      slug: generatedSlug,
      description: description || '',
      locales: serializedLocales,
      order: order !== undefined ? parseInt(order) : 0,
      isActive: isActive !== undefined ? !!isActive : true,
    }).returning();

    const createdCol = result[0];

    // Если переданы movieIds, привязываем фильмы к подборке
    if (Array.isArray(movieIds) && movieIds.length > 0) {
      const validMovieIds = movieIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      for (let i = 0; i < validMovieIds.length; i++) {
        await db.insert(collectionMovies).values({
          collectionId: createdCol.id,
          movieId: validMovieIds[i],
          order: i,
        });
      }
    }

    const colMovies = await fetchCollectionMovies(createdCol.id);

    return res.status(201).json({
      message: 'Подборка фильмов успешно создана',
      collection: {
        id: createdCol.id,
        title: createdCol.title,
        slug: createdCol.slug,
        description: createdCol.description,
        locales: Array.isArray(locales) ? locales : [],
        order: createdCol.order,
        isActive: createdCol.isActive,
        movies: colMovies,
        movieIds: colMovies.map((m: any) => m.id),
        createdAt: createdCol.createdAt,
      },
    });
  } catch (error) {
    console.error('Ошибка при создании подборки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/collections/:id
 * Редактирование подборки фильмов (Admin only).
 * Позволяет обновлять название, слаг, описание, локали, порядок, активность и список привязанных фильмов (movieIds).
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const colId = parseInt(req.params.id);
    if (isNaN(colId)) {
      return res.status(400).json({ error: 'Неверный ID коллекции' });
    }

    const existingCol = await db.select().from(collections).where(eq(collections.id, colId)).get();
    if (!existingCol) {
      return res.status(404).json({ error: 'Подборка не найдена' });
    }

    const { title, slug, description, locales, order, isActive, movieIds } = req.body;

    let updatedSlug = existingCol.slug;
    if (slug && typeof slug === 'string' && slug.trim() !== '' && slug.trim() !== existingCol.slug) {
      const formattedSlug = slug.trim().toLowerCase().replace(/\s+/g, '-');
      const slugCheck = await db.select().from(collections).where(eq(collections.slug, formattedSlug)).get();
      if (slugCheck && slugCheck.id !== colId) {
        return res.status(400).json({ error: `Слаг "${formattedSlug}" уже занят другой подборкой` });
      }
      updatedSlug = formattedSlug;
    }

    const serializedLocales = Array.isArray(locales) ? JSON.stringify(locales) : existingCol.locales;

    const updatedResult = await db.update(collections)
      .set({
        title: title !== undefined ? String(title).trim() : existingCol.title,
        slug: updatedSlug,
        description: description !== undefined ? String(description) : existingCol.description,
        locales: serializedLocales,
        order: order !== undefined ? parseInt(order) : existingCol.order,
        isActive: isActive !== undefined ? !!isActive : existingCol.isActive,
      })
      .where(eq(collections.id, colId))
      .returning();

    // Если передан список movieIds, обновляем связи фильмовой подборки
    if (Array.isArray(movieIds)) {
      // Удаляем старые связи
      await db.delete(collectionMovies).where(eq(collectionMovies.collectionId, colId));

      // Добавляем новые
      const validMovieIds = movieIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      for (let i = 0; i < validMovieIds.length; i++) {
        await db.insert(collectionMovies).values({
          collectionId: colId,
          movieId: validMovieIds[i],
          order: i,
        });
      }
    }

    const colMovies = await fetchCollectionMovies(colId);
    let parsedLocales = [];
    try {
      parsedLocales = JSON.parse(updatedResult[0].locales || '[]');
    } catch (e) { }

    return res.json({
      message: 'Подборка фильмов успешно обновлена',
      collection: {
        id: updatedResult[0].id,
        title: updatedResult[0].title,
        slug: updatedResult[0].slug,
        description: updatedResult[0].description,
        locales: parsedLocales,
        order: updatedResult[0].order,
        isActive: updatedResult[0].isActive,
        movies: colMovies,
        movieIds: colMovies.map((m: any) => m.id),
        createdAt: updatedResult[0].createdAt,
      },
    });
  } catch (error) {
    console.error('Ошибка при обновлении подборки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/collections/:id
 * Удаление подборки фильмов (Admin only).
 */
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const colId = parseInt(req.params.id);
    if (isNaN(colId)) {
      return res.status(400).json({ error: 'Неверный ID коллекции' });
    }

    const existingCol = await db.select().from(collections).where(eq(collections.id, colId)).get();
    if (!existingCol) {
      return res.status(404).json({ error: 'Подборка не найдена' });
    }

    await db.delete(collections).where(eq(collections.id, colId));

    return res.json({ message: 'Подборка фильмов успешно удалена' });
  } catch (error) {
    console.error('Ошибка при удалении подборки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/collections/:id/movies
 * Добавление конкретного фильма в подборку (Admin only).
 * Body: { movieId: number, order?: number }
 */
router.post('/:id/movies', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const colId = parseInt(req.params.id);
    if (isNaN(colId)) {
      return res.status(400).json({ error: 'Неверный ID коллекции' });
    }

    const { movieId, order } = req.body;
    const parsedMovieId = parseInt(movieId);
    if (isNaN(parsedMovieId)) {
      return res.status(400).json({ error: 'Поле movieId обязательно и должно быть числом' });
    }

    const col = await db.select().from(collections).where(eq(collections.id, colId)).get();
    if (!col) {
      return res.status(404).json({ error: 'Подборка не найдена' });
    }

    const movie = await db.select().from(movies).where(eq(movies.id, parsedMovieId)).get();
    if (!movie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    // Проверяем, не добавлен ли уже этот фильм в подборку
    const existing = await db.select()
      .from(collectionMovies)
      .where(and(eq(collectionMovies.collectionId, colId), eq(collectionMovies.movieId, parsedMovieId)))
      .get();

    if (existing) {
      return res.status(200).json({ message: 'Фильм уже добавлен в эту подборку', item: existing });
    }

    const result = await db.insert(collectionMovies).values({
      collectionId: colId,
      movieId: parsedMovieId,
      order: order !== undefined ? parseInt(order) : 0,
    }).returning();

    return res.status(201).json({ message: 'Фильм успешно добавлен в подборку', item: result[0] });
  } catch (error) {
    console.error('Ошибка при добавлении фильма в подборку:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/collections/:id/movies/:movieId
 * Удаление фильма из подборки (Admin only).
 */
router.delete('/:id/movies/:movieId', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const colId = parseInt(req.params.id);
    const movieId = parseInt(req.params.movieId);

    if (isNaN(colId) || isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверные ID коллекции или фильма' });
    }

    await db.delete(collectionMovies)
      .where(and(eq(collectionMovies.collectionId, colId), eq(collectionMovies.movieId, movieId)));

    return res.json({ message: 'Фильм успешно удален из подборки' });
  } catch (error) {
    console.error('Ошибка при удалении фильма из подборки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
