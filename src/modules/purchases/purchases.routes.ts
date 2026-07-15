import { Router, Response } from 'express';
import { eq, and, desc, sql, isNotNull, isNull, lt, gt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { purchases, userSubscriptions, subscriptionTypes, movies, users } from '../../db/schema.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth/auth.middleware.js';

const router = Router();

/**
 * GET /api/purchases/subscription-types
 * Получение списка доступных планов подписок.
 */
router.get('/subscription-types', async (req, res): Promise<any> => {
  try {
    const plans = await db.select().from(subscriptionTypes).all();
    
    if (plans.length === 0) {
      const defaultPlans = [
        { name: 'Месячная подписка (Basic)', price: 299.0, durationDays: 30 },
        { name: 'Годовая подписка (Premium)', price: 1999.0, durationDays: 365 },
      ];
      
      const inserted = await db.insert(subscriptionTypes).values(defaultPlans).returning();
      return res.json(inserted);
    }
    
    return res.json(plans);
  } catch (error) {
    console.error('Ошибка при получении типов подписок:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/purchases/subscription-types
 * Создание нового тарифного плана подписки (Админ только).
 */
router.post('/subscription-types', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name, price, durationDays } = req.body;

    if (!name || price === undefined || durationDays === undefined) {
      return res.status(400).json({ error: 'Поля name, price и durationDays обязательны' });
    }

    const priceNum = parseFloat(price);
    const daysNum = parseInt(durationDays);

    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Цена должна быть положительным числом' });
    }
    if (isNaN(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: 'Количество дней должно быть целым положительным числом' });
    }

    const result = await db.insert(subscriptionTypes).values({
      name: name.trim(),
      price: priceNum,
      durationDays: daysNum,
    }).returning();

    return res.status(201).json({
      message: 'Тарифный план подписки успешно создан',
      subscriptionType: result[0],
    });
  } catch (error) {
    console.error('Ошибка создания типа подписки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/purchases/subscription-types/:id
 * Изменение тарифного плана подписки (Админ только).
 */
router.put('/subscription-types/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Неверный ID тарифного плана' });
    }

    const { name, price, durationDays } = req.body;

    const existingPlan = await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.id, planId)).get();
    if (!existingPlan) {
      return res.status(404).json({ error: 'Тарифный план не найден' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Цена должна быть положительным числом' });
      }
      updateData.price = priceNum;
    }
    if (durationDays !== undefined) {
      const daysNum = parseInt(durationDays);
      if (isNaN(daysNum) || daysNum <= 0) {
        return res.status(400).json({ error: 'Количество дней должно быть целым положительным числом' });
      }
      updateData.durationDays = daysNum;
    }

    const updated = await db.update(subscriptionTypes)
      .set(updateData)
      .where(eq(subscriptionTypes.id, planId))
      .returning();

    return res.json({
      message: 'Тарифный план успешно обновлен',
      subscriptionType: updated[0],
    });
  } catch (error) {
    console.error('Ошибка обновления типа подписки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/purchases/subscription-types/:id
 * Удаление тарифного плана подписки (Админ только).
 */
router.delete('/subscription-types/:id', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Неверный ID тарифного плана' });
    }

    const existingPlan = await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.id, planId)).get();
    if (!existingPlan) {
      return res.status(404).json({ error: 'Тарифный план не найден' });
    }

    await db.delete(subscriptionTypes).where(eq(subscriptionTypes.id, planId));

    return res.json({ message: 'Тарифный план подписки успешно удален' });
  } catch (error) {
    console.error('Ошибка при удалении типа подписки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/purchases/buy-movie
 * Покупка конкретного фильма навсегда (Симуляция оплаты).
 */
router.post('/buy-movie', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { movieId } = req.body;
    const user = req.user!;

    if (!movieId) {
      return res.status(400).json({ error: 'Необходимо указать movieId' });
    }

    const movie = await db.select().from(movies).where(eq(movies.id, movieId)).get();
    if (!movie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }

    const existing = await db.select()
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, user.id),
          eq(purchases.movieId, movieId),
          eq(purchases.status, 'completed')
        )
      )
      .get();

    if (existing) {
      return res.status(400).json({ error: 'Этот фильм уже куплен вами' });
    }

    const amount = 199.0; // Симуляция цены

    const result = await db.insert(purchases).values({
      userId: user.id,
      movieId: movieId,
      amount: amount,
      status: 'completed',
    }).returning();

    return res.status(201).json({
      message: 'Фильм успешно приобретен',
      purchase: result[0],
    });
  } catch (error) {
    console.error('Ошибка при покупке фильма:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/purchases/subscribe
 * Покупка подписки (Симуляция оплаты).
 */
router.post('/subscribe', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { subscriptionTypeId } = req.body;
    const user = req.user!;

    if (!subscriptionTypeId) {
      return res.status(400).json({ error: 'Необходимо указать subscriptionTypeId' });
    }

    const plan = await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.id, subscriptionTypeId)).get();
    if (!plan) {
      return res.status(404).json({ error: 'Выбранный тарифный план подписки не найден' });
    }

    await db.insert(purchases).values({
      userId: user.id,
      subscriptionTypeId: subscriptionTypeId,
      amount: plan.price,
      status: 'completed',
    });

    const now = new Date();
    
    // Продление, если уже есть активная подписка
    const activeSubs = await db.select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, user.id))
      .all();
      
    const currentActiveSub = activeSubs
      .filter(sub => sub.expiresAt > now.toISOString())
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0];

    let startDate = now;
    if (currentActiveSub) {
      startDate = new Date(currentActiveSub.expiresAt);
    }

    const expiresAtDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    const expiresAtStr = expiresAtDate.toISOString();

    const newSubscription = await db.insert(userSubscriptions).values({
      userId: user.id,
      subscriptionTypeId: subscriptionTypeId,
      expiresAt: expiresAtStr,
    }).returning();

    return res.status(201).json({
      message: 'Подписка успешно оформлена/продлена',
      subscription: newSubscription[0],
    });
  } catch (error) {
    console.error('Ошибка при оформлении подписки:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/purchases/history
 * История покупок (всех платежей) с пагинацией и фильтрами.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: размер страницы (ENUM: 10, 20, 50, по умолчанию 10)
 * - status: статус платежа ('completed', 'pending')
 * - type: тип покупки ('movie' или 'subscription')
 * - userId: ID пользователя (Админ только, чтобы увидеть историю конкретного юзера. Обычный клиент видит только свою)
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    const statusFilter = req.query.status as string;
    const typeFilter = req.query.type as string; // 'movie' или 'subscription'
    const userIdParam = parseInt(req.query.userId as string);

    const conditions = [];

    // Ограничение прав: обычные клиенты видят только свои транзакции. Админ может фильтровать по любому пользователю.
    if (req.user!.role === 'admin') {
      if (!isNaN(userIdParam)) {
        conditions.push(eq(purchases.userId, userIdParam));
      }
    } else {
      conditions.push(eq(purchases.userId, req.user!.id));
    }

    if (statusFilter === 'completed' || statusFilter === 'pending') {
      conditions.push(eq(purchases.status, statusFilter));
    }

    if (typeFilter === 'movie') {
      conditions.push(isNotNull(purchases.movieId));
    } else if (typeFilter === 'subscription') {
      conditions.push(isNotNull(purchases.subscriptionTypeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Запрос истории с JOIN'ами для детальной информации о купленном товаре
    const list = await db.select({
      id: purchases.id,
      userId: purchases.userId,
      amount: purchases.amount,
      status: purchases.status,
      createdAt: purchases.createdAt,
      movieId: purchases.movieId,
      movieTitle: movies.title,
      subscriptionTypeId: purchases.subscriptionTypeId,
      subscriptionName: subscriptionTypes.name,
      userEmail: users.email
    })
    .from(purchases)
    .leftJoin(movies, eq(purchases.movieId, movies.id))
    .leftJoin(subscriptionTypes, eq(purchases.subscriptionTypeId, subscriptionTypes.id))
    .leftJoin(users, eq(purchases.userId, users.id))
    .where(whereClause)
    .orderBy(desc(purchases.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(purchases)
      .where(whereClause)
      .get();

    const totalResults = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    const isEmpty = list.length === 0;

    return res.json({
      items: list,
      currentPage: page,
      isEmpty,
      resultsPerPage: pageSize,
      totalPages,
      totalResults
    });
  } catch (error) {
    console.error('Ошибка получения истории платежей:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/purchases/subscriptions
 * Список оформленных подписок с пагинацией и фильтром активности.
 * Query параметры:
 * - page: номер страницы (по умолчанию 1)
 * - pageSize: размер страницы (ENUM: 10, 20, 50, по умолчанию 10)
 * - isActive: фильтр активности ('true' или 'false')
 * - userId: ID пользователя (Админ только, для фильтра по конкретному юзеру)
 */
router.get('/subscriptions', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const rawPageSize = parseInt(req.query.pageSize as string);
    const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
    const offset = (page - 1) * pageSize;

    const isActiveFilter = req.query.isActive as string; // 'true' или 'false'
    const userIdParam = parseInt(req.query.userId as string);

    const conditions = [];

    // Ограничение прав
    if (req.user!.role === 'admin') {
      if (!isNaN(userIdParam)) {
        conditions.push(eq(userSubscriptions.userId, userIdParam));
      }
    } else {
      conditions.push(eq(userSubscriptions.userId, req.user!.id));
    }

    const nowStr = new Date().toISOString();
    if (isActiveFilter === 'true') {
      conditions.push(gt(userSubscriptions.expiresAt, nowStr));
    } else if (isActiveFilter === 'false') {
      conditions.push(lt(userSubscriptions.expiresAt, nowStr));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await db.select({
      id: userSubscriptions.id,
      userId: userSubscriptions.userId,
      subscriptionTypeId: userSubscriptions.subscriptionTypeId,
      subscriptionName: subscriptionTypes.name,
      expiresAt: userSubscriptions.expiresAt,
      createdAt: userSubscriptions.createdAt,
      userEmail: users.email
    })
    .from(userSubscriptions)
    .leftJoin(subscriptionTypes, eq(userSubscriptions.subscriptionTypeId, subscriptionTypes.id))
    .leftJoin(users, eq(userSubscriptions.userId, users.id))
    .where(whereClause)
    .orderBy(desc(userSubscriptions.expiresAt))
    .limit(pageSize)
    .offset(offset)
    .all();

    const totalCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(userSubscriptions)
      .where(whereClause)
      .get();

    const totalResults = totalCountResult?.count || 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    const isEmpty = list.length === 0;

    return res.json({
      items: list,
      currentPage: page,
      isEmpty,
      resultsPerPage: pageSize,
      totalPages,
      totalResults
    });
  } catch (error) {
    console.error('Ошибка получения списка подписок:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
