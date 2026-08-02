import { Router, Response } from 'express';
import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { favorites, movies, categories, ratings } from '../../db/schema.js';
import { authenticateToken, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * GET /api/favorites
 * Получение списка избранных фильмов текущего пользователя с пагинацией.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: количество фильмов на странице (ENUM: 10, 20, 50, по умолчанию 10)
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    // Получаем избранные фильмы юзера вместе с деталями фильмов и статистикой рейтингов
    const favoritesList = await db.select({
      favoriteId: favorites.id,
      favoritedAt: favorites.createdAt,
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
      createdAt: movies.createdAt,
      averageRating: sql<number>`ROUND(COALESCE(AVG(${ratings.rating}), 0), 1)`,
      ratingCount: sql<number>`COUNT(${ratings.rating})`,
    })
    .from(favorites)
    .innerJoin(movies, eq(favorites.movieId, movies.id))
    .leftJoin(ratings, eq(movies.id, ratings.movieId))
    .leftJoin(categories, eq(movies.categoryId, categories.id))
    .where(eq(favorites.userId, userId))
    .groupBy(movies.id, favorites.id)
    .orderBy(desc(favorites.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

    // Общее количество избранных фильмов для пагинации
    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .get();

    const totalItems = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Форматируем список фильмов
    const formattedItems = favoritesList.map((item: any) => {
      let parsedTags = [];
      try {
        parsedTags = JSON.parse(item.tags || '[]');
      } catch (e) {
        parsedTags = [];
      }

      const categoryObj = item.categoryId ? { id: item.categoryId, name: item.categoryName } : null;

      return {
        favoriteId: item.favoriteId,
        favoritedAt: item.favoritedAt,
        id: item.id,
        title: item.title,
        description: item.description,
        posterUrl: item.posterUrl,
        videoUrl: item.videoUrl,
        isPremium: item.isPremium,
        author: item.author,
        tags: parsedTags,
        category: categoryObj,
        averageRating: item.averageRating,
        ratingCount: item.ratingCount,
        isFavorite: true,
        createdAt: item.createdAt,
      };
    });

    return res.json({
      items: formattedItems,
      page,
      pageSize,
      totalPages,
      totalResults: totalItems,
    });
  } catch (error) {
    console.error('Ошибка при получении списка избранного:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/favorites/check/:movieId
 * Проверка, находится ли фильм в избранном у текущего пользователя.
 */
router.get('/check/:movieId', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const movieId = parseInt(req.params.movieId);

    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const favoriteItem = await db.select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.movieId, movieId)))
      .get();

    return res.json({
      isFavorite: !!favoriteItem,
      favoriteId: favoriteItem ? favoriteItem.id : null,
    });
  } catch (error) {
    console.error('Ошибка при проверке избранного:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/favorites
 * Добавление фильма в избранное.
 * Body: { movieId: number }
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const { movieId } = req.body;
    const parsedMovieId = parseInt(movieId);

    if (isNaN(parsedMovieId)) {
      return res.status(400).json({ error: 'Поле movieId обязательно и должно быть числом' });
    }

    // Проверяем существование фильма
    const movieExists = await db.select().from(movies).where(eq(movies.id, parsedMovieId)).get();
    if (!movieExists) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    // Проверяем, не добавлен ли уже фильм в избранное
    const existingFavorite = await db.select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.movieId, parsedMovieId)))
      .get();

    if (existingFavorite) {
      return res.status(200).json({
        message: 'Фильм уже находится в избранном',
        favorite: existingFavorite,
        isFavorite: true,
      });
    }

    // Добавляем в избранное
    const result = await db.insert(favorites).values({
      userId,
      movieId: parsedMovieId,
    }).returning();

    return res.status(201).json({
      message: 'Фильм успешно добавлен в избранное',
      favorite: result[0],
      isFavorite: true,
    });
  } catch (error) {
    console.error('Ошибка при добавлении в избранное:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/favorites/:movieId
 * Удаление фильма из избранного по ID фильма.
 */
router.delete('/:movieId', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const movieId = parseInt(req.params.movieId);

    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Неверный ID фильма' });
    }

    const existingFavorite = await db.select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.movieId, movieId)))
      .get();

    if (!existingFavorite) {
      return res.status(404).json({ error: 'Фильм не найден в списке избранного' });
    }

    await db.delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.movieId, movieId)));

    return res.json({
      message: 'Фильм успешно удален из избранного',
      isFavorite: false,
    });
  } catch (error) {
    console.error('Ошибка при удалении из избранного:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
