import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Таблица Пользователей (Users)
 * Содержит данные аккаунта: email, хэш пароля и роль пользователя (client или admin).
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['client', 'admin'] }).default('client').notNull(),
  firstName: text('first_name').default('').notNull(), // Имя
  lastName: text('last_name').default('').notNull(), // Фамилия
  phoneNumber: text('phone_number').default('').notNull(), // Номер телефона
  cardNumber: text('card_number'), // Номер карты (опционально)
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Категорий (Categories)
 * Содержит категории (жанры/типы контента), создаваемые администратором.
 */
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(), // Например: "Фильмы", "Сериалы", "Аниме", "Ужасы"
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Фильмов (Movies)
 * Описывает каталог фильмов. Поле isPremium указывает,
 * требует ли просмотр активную подписку или индивидуальную покупку.
 * Поля:
 * - author: автор / режиссер фильма.
 * - tags: теги фильма (хранятся в виде JSON-массива строк, например: '["фантастика", "экшен"]').
 * - categoryId: связь с таблицей категорий (опциональная/nullable).
 */
export const movies = sqliteTable('movies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  videoUrl: text('video_url').notNull(), // Ссылка на стриминг видео-файла
  isPremium: integer('is_premium', { mode: 'boolean' }).default(false).notNull(), // Требуется ли подписка/покупка
  author: text('author').default('Неизвестный автор').notNull(), // Автор / Режиссер
  tags: text('tags').default('[]').notNull(), // Теги / Жанры (JSON строка)
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }), // Опциональная категория
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Оценок Фильмов (Ratings)
 * Позволяет авторизованным пользователям ставить оценки фильмам (от 1 до 10) и писать отзывы.
 */
export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  movieId: integer('movie_id')
    .references(() => movies.id, { onDelete: 'cascade' })
    .notNull(),
  rating: integer('rating').notNull(), // Оценка от 1 до 10
  comment: text('comment'), // Опциональный отзыв
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Типов Подписок (Subscription Types)
 * Справочник доступных планов (например: "Базовая" на 30 дней, "Премиум" на 90 дней).
 */
export const subscriptionTypes = sqliteTable('subscription_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  price: real('price').notNull(),
  durationDays: integer('duration_days').notNull(), // Продолжительность подписки в днях
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Активных Подписок Пользователей (User Subscriptions)
 * Показывает, у какого пользователя какая подписка сейчас активна и когда она истекает.
 */
export const userSubscriptions = sqliteTable('user_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  subscriptionTypeId: integer('subscription_type_id')
    .references(() => subscriptionTypes.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: text('expires_at').notNull(), // Дата окончания действия подписки (ISO строка)
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Таблица Покупок (Purchases)
 * Хранит историю транзакций: покупку конкретного фильма или покупку подписки.
 */
export const purchases = sqliteTable('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  movieId: integer('movie_id')
    .references(() => movies.id, { onDelete: 'set null' }), // Если купили фильм напрямую
  subscriptionTypeId: integer('subscription_type_id')
    .references(() => subscriptionTypes.id, { onDelete: 'set null' }), // Если купили подписку
  amount: real('amount').notNull(), // Сумма оплаты
  status: text('status', { enum: ['pending', 'completed'] }).default('completed').notNull(), // Статус оплаты
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
