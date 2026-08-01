import { Router, Response } from 'express';
import { eq, and, or, like, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * GET /api/users/profile
 * Получение профиля текущего авторизованного пользователя.
 */
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const user = req.user!;
    const profile = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      phoneNumber: users.phoneNumber,
      cardNumber: users.cardNumber,
      createdAt: users.createdAt
    })
      .from(users)
      .where(eq(users.id, user.id))
      .get();

    if (!profile) {
      return res.status(404).json({ error: 'Профиль не найден' });
    }

    return res.json(profile);
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/users/profile
 * Обновление личного профиля (Имя, Фамилия, Номер телефона, Карточка, а также смена пароля).
 */
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const user = req.user!;
    const { firstName, lastName, phoneNumber, cardNumber, password } = req.body;

    const existingUser = await db.select().from(users).where(eq(users.id, user.id)).get();
    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.trim();
    if (cardNumber !== undefined) updateData.cardNumber = cardNumber ? cardNumber.trim() : null;

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    const updated = await db.update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        phoneNumber: users.phoneNumber,
        cardNumber: users.cardNumber,
      });

    return res.json({
      message: 'Профиль успешно обновлен',
      user: updated[0]
    });
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users
 * Список всех пользователей с пагинацией и фильтрами (Админ только).
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: размер страницы (ENUM: 10, 20, 50, по умолчанию 10)
 * - fullName: поиск по имени/фамилии (частичное совпадение)
 * - phoneNumber: поиск по номеру телефона (частичное совпадение)
 * - role: фильтр по роли ('client' или 'admin')
 * - cardNumber: поиск по номеру карты (частичное совпадение)
 * - createdAt: поиск по дате создания (частичное совпадение по строке ISO)
 */
router.get('/', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    const fullNameFilter = req.query.fullName as string;
    const phoneNumberFilter = req.query.phoneNumber as string;
    const roleFilter = req.query.role as string;
    const cardNumberFilter = req.query.cardNumber as string;
    const createdAtFilter = req.query.createdAt as string;

    const conditions = [];

    if (fullNameFilter) {
      conditions.push(
        or(
          like(users.firstName, `%${fullNameFilter}%`),
          like(users.lastName, `%${fullNameFilter}%`)
        )
      );
    }
    if (phoneNumberFilter) {
      conditions.push(like(users.phoneNumber, `%${phoneNumberFilter}%`));
    }
    if (roleFilter === 'admin' || roleFilter === 'client') {
      conditions.push(eq(users.role, roleFilter));
    }
    if (cardNumberFilter) {
      conditions.push(like(users.cardNumber, `%${cardNumberFilter}%`));
    }
    if (createdAtFilter) {
      conditions.push(like(users.createdAt, `%${createdAtFilter}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Выборка пользователей с пагинацией
    const list = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      phoneNumber: users.phoneNumber,
      cardNumber: users.cardNumber,
      createdAt: users.createdAt
    })
      .from(users)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .all();

    // Получаем общее количество записей для пагинации
    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(whereClause)
      .get();

    const totalResults = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    const isEmpty = list.length === 0;

    return res.json({
      items: list,
      page,
      pageSize,
      totalPages,
      totalResults
    });
  } catch (error) {
    console.error('Ошибка получения списка пользователей:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/users
 * Создание нового пользователя (Админ только).
 */
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { email, password, firstName, lastName, phoneNumber, cardNumber, role } = req.body;

    if (!email || !password || !firstName || !lastName || !phoneNumber) {
      return res.status(400).json({ error: 'Заполните все обязательные поля (email, пароль, имя, фамилия, телефон)' });
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userRole = (role === 'admin') ? 'admin' : 'client';

    const result = await db.insert(users).values({
      email,
      passwordHash,
      role: userRole,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: phoneNumber.trim(),
      cardNumber: cardNumber ? cardNumber.trim() : null
    }).returning({
      id: users.id,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      phoneNumber: users.phoneNumber,
      cardNumber: users.cardNumber,
      createdAt: users.createdAt
    });

    return res.status(201).json({
      message: 'Пользователь успешно создан',
      user: result[0]
    });
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/users/:id
 * Редактирование любого пользователя (Админ только, например для изменения роли).
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const { firstName, lastName, phoneNumber, cardNumber, role, password } = req.body;

    const existingUser = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.trim();
    if (cardNumber !== undefined) updateData.cardNumber = cardNumber ? cardNumber.trim() : null;
    if (role !== undefined) {
      if (role !== 'admin' && role !== 'client') {
        return res.status(400).json({ error: 'Неверная роль пользователя' });
      }
      updateData.role = role;
    }

    // if (password && password.trim() !== '') {
    //   const salt = await bcrypt.genSalt(10);
    //   updateData.passwordHash = await bcrypt.hash(password, salt);
    // }

    const updated = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        phoneNumber: users.phoneNumber,
        cardNumber: users.cardNumber,
        createdAt: users.createdAt
      });

    return res.json({
      message: 'Данные пользователя успешно обновлены',
      user: updated[0]
    });
  } catch (error) {
    console.error('Ошибка редактирования пользователя админом:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/users/:id
 * Удаление пользователя (Админ только).
 */
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const existingUser = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Защита от удаления самого себя (если админ пытается удалить свою учетную запись)
    if (existingUser.id === req.user!.id) {
      return res.status(400).json({ error: 'Вы не можете удалить свою собственную учетную запись' });
    }

    await db.delete(users).where(eq(users.id, userId));

    return res.json({ message: 'Пользователь успешно удален' });
  } catch (error) {
    console.error('Ошибка удаления пользователя:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users/:id
 * Получение подробной информации о любом пользователе (Админ только).
 */
router.get('/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const profile = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      phoneNumber: users.phoneNumber,
      cardNumber: users.cardNumber,
      createdAt: users.createdAt
    })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!profile) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    return res.json(profile);
  } catch (error) {
    console.error('Ошибка получения деталей пользователя:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
