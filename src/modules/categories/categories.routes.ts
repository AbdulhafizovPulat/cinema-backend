import { Router, Response } from 'express';
import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { categories } from '../../db/schema.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * GET /api/categories
 * Получить список всех категорий с пагинацией и фильтрами.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: размер страницы (ENUM: 10, 20, 50, по умолчанию 10)
 * - name: фильтр по имени категории (частичное совпадение)
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    
    // Валидируем pageSize: строго 10, 20, 50. Иначе сбрасываем на 10.
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    const nameFilter = req.query.name as string;
    const conditions = [];

    if (nameFilter) {
      conditions.push(like(categories.name, `%${nameFilter}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await db.select()
      .from(categories)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .all();

    // Получаем общее количество записей для пагинации
    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(categories)
      .where(whereClause)
      .get();

    const totalResults = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    const isEmpty = list.length === 0;

    // Возвращаем в требуемом формате пагинации
    return res.json({
      items: list,
      currentPage: page,
      isEmpty,
      resultsPerPage: pageSize,
      totalPages,
      totalResults
    });
  } catch (error) {
    console.error('Ошибка при получении списка категорий:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/categories
 * Создать новую категорию (Доступно только Admin).
 */
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }

    // Проверяем, существует ли уже категория с таким именем
    const existing = await db.select().from(categories).where(eq(categories.name, name.trim())).get();
    if (existing) {
      return res.status(400).json({ error: 'Категория с таким именем уже существует' });
    }

    const result = await db.insert(categories).values({
      name: name.trim(),
    }).returning();

    return res.status(201).json({
      message: 'Категория успешно создана',
      category: result[0],
    });
  } catch (error) {
    console.error('Ошибка создания категории:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/categories/:id
 * Обновить название категории (Доступно только Admin).
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const categoryId = parseInt(req.params.id);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }

    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Название категории обязательно для обновления' });
    }

    // Проверяем существование категории
    const existingCategory = await db.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!existingCategory) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Проверяем уникальность нового имени
    const nameCheck = await db.select().from(categories).where(eq(categories.name, name.trim())).get();
    if (nameCheck && nameCheck.id !== categoryId) {
      return res.status(400).json({ error: 'Другая категория уже имеет это имя' });
    }

    const updated = await db.update(categories)
      .set({ name: name.trim() })
      .where(eq(categories.id, categoryId))
      .returning();

    return res.json({
      message: 'Категория успешно обновлена',
      category: updated[0],
    });
  } catch (error) {
    console.error('Ошибка при обновлении категории:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/categories/:id
 * Удалить категорию (Доступно только Admin).
 * Связанные фильмы перейдут в категорию NULL (опциональная связь).
 */
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const categoryId = parseInt(req.params.id);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }

    const existingCategory = await db.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!existingCategory) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    await db.delete(categories).where(eq(categories.id, categoryId));

    return res.json({ message: 'Категория успешно удалена' });
  } catch (error) {
    console.error('Ошибка при удалении категории:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
