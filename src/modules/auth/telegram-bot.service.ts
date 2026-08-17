import { Telegraf, Markup } from 'telegraf';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { TelegramLoggerService } from '../logger/telegram-logger.service.js';

export interface AuthSessionData {
  phone?: string;
  status: 'pending' | 'verified' | 'expired';
  createdAt: number;
  userId?: number;
  tokens?: {
    token: string;
    refreshToken: string;
    user: any;
  };
}

// Хранилище сессий в памяти
// sessionToken -> { phone?: string, status: 'pending' | 'verified' | 'expired', createdAt: number, userId?: number }
const authSessions = new Map<string, AuthSessionData>();

// Отображение ID пользователя Telegram -> sessionToken
const userSessions = new Map<number, string>();

let botInstance: Telegraf | null = null;
let botUsername = process.env.TELEGRAM_AUTH_BOT_USERNAME || '';

const SESSION_TTL_MS = 10 * 60 * 1000; // Срок жизни сессии - 10 минут

// Очистка устаревших сессий раз в 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of authSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      authSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

export class TelegramBotService {
  /**
   * Инициализация и запуск Telegram Auth Бота
   */
  static async init(): Promise<void> {
    const botToken = process.env.TELEGRAM_AUTH_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn('⚠️ [Telegram Auth Bot] TELEGRAM_AUTH_BOT_TOKEN не задан в .env. Бот авторизации не запущен.');
      return;
    }

    try {
      const bot = new Telegraf(botToken);
      botInstance = bot;

      // 1. Обработка команды /start
      bot.start(async (ctx) => {
        const startPayload = ctx.payload; // То, что передано в ссылке после ?start=TOKEN
        const fromId = ctx.from.id;

        // Если открыли по ссылке из приложения: https://t.me/bot?start=12345
        if (startPayload) {
          // Сохраняем привязку пользователя к токене сессии
          userSessions.set(fromId, startPayload);

          // Проверяем или создаем сессию в памяти
          let session = authSessions.get(startPayload);
          if (!session) {
            session = {
              status: 'pending',
              createdAt: Date.now()
            };
            authSessions.set(startPayload, session);
          }

          return ctx.reply(
            '🎬 *Добро пожаловать в онлайн-кинотеатр!*\n\n' +
            'Для подтверждения входа нажмите большую кнопку внизу экрана 👇',
            {
              parse_mode: 'Markdown',
              ...Markup.keyboard([
                [Markup.button.contactRequest('📱 Подтвердить номер телефона')]
              ])
              .resize()
              .oneTime()
            }
          );
        }

        // Если пользователь просто нашёл бота в поиске Telegram
        return ctx.reply(
          '👋 Этот бот нужен для быстрого входа в приложение без SMS.\n\n' +
          'Чтобы войти, откройте приложение кинотеатра и нажмите *"Войти через Telegram"*.',
          {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
          }
        );
      });

      // 2. Обработка нажатия кнопки "Поделиться контактом"
      bot.on('contact', async (ctx) => {
        const contact = ctx.message.contact;
        const fromId = ctx.from.id;

        // Проверка: отправил ли пользователь именно СВОЙ контакт
        if (contact.user_id !== fromId) {
          return ctx.reply('⚠️ Пожалуйста, отправьте свой собственный контакт через кнопку внизу.');
        }

        // Очищаем номер от плюсов и пробелов: "998901234567"
        const cleanPhone = contact.phone_number.replace(/\D/g, '');

        // Находим токен сессии для данного пользователя Telegram
        const sessionToken = userSessions.get(fromId);
        if (sessionToken && authSessions.has(sessionToken)) {
          const session = authSessions.get(sessionToken)!;
          session.status = 'verified';
          session.phone = cleanPhone;
          authSessions.set(sessionToken, session);
        }

        // Убираем клавиатуру и пишем об успехе
        await ctx.reply(
          `✅ *Номер +${cleanPhone} успешно подтверждён!*\n\n` +
          'Можете возвращаться в приложение кинотеатра — вход выполнен.',
          {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
          }
        );

        await TelegramLoggerService.log(`📱 [TELEGRAM AUTH] Подтвержден номер телефона +${cleanPhone} для сессии ${sessionToken || 'неизвестно'}`);
      });

      // 3. Команда /help
      bot.help((ctx) => {
        return ctx.reply(
          '❓ *Как войти в аккаунт:*\n\n' +
          '1. Откройте приложение кинотеатра и укажите номер телефона.\n' +
          '2. Нажмите кнопку "Войти через Telegram".\n' +
          '3. В боте нажмите "Start", а затем зелёную кнопку "📱 Подтвердить номер телефона".',
          { parse_mode: 'Markdown' }
        );
      });

      // 4. Команда /support
      bot.command('support', (ctx) => {
        const supportUsername = process.env.TELEGRAM_SUPPORT_USERNAME || 'your_support_username';
        return ctx.reply(`💬 По всем вопросам пишите нашей поддержке: @${supportUsername}`);
      });

      // Получаем имя бота
      bot.telegram.getMe().then((me) => {
        botUsername = me.username;
        console.log(`🤖 Telegram Auth-бот @${botUsername} запущен и слушает события!`);
      }).catch((e) => {
        console.warn('⚠️ [Telegram Auth Bot] Не удалось получить username бота:', e.message);
      });

      // 5. Запуск бота (Long Polling)
      bot.launch().catch((err) => {
        console.error('❌ Ошибка запуска Telegram Auth бота:', err);
      });

      // Мягкая остановка при перезапуске сервера
      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (err) {
      console.error('❌ Ошибка при инициализации Telegraf bot:', err);
    }
  }

  /**
   * Создание новой сессии авторизации Telegram для frontend/мобильного приложения
   */
  static createAuthSession(): { sessionToken: string; botUsername: string; telegramUrl: string } {
    const sessionToken = crypto.randomUUID();
    authSessions.set(sessionToken, {
      status: 'pending',
      createdAt: Date.now()
    });

    const activeBotUsername = botUsername || process.env.TELEGRAM_AUTH_BOT_USERNAME || 'cinema_auth_bot';
    const telegramUrl = `https://t.me/${activeBotUsername}?start=${sessionToken}`;

    return {
      sessionToken,
      botUsername: activeBotUsername,
      telegramUrl
    };
  }

  /**
   * Проверка состояния сессии и выполнения авторизации/регистрации пользователя
   */
  static async checkAndProcessSession(sessionToken: string): Promise<any> {
    const session = authSessions.get(sessionToken);

    if (!session) {
      return { status: 'expired', error: 'Сессия не найдена или истекла.' };
    }

    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      session.status = 'expired';
      authSessions.delete(sessionToken);
      return { status: 'expired', error: 'Срок действия сессии истек.' };
    }

    if (session.status === 'pending') {
      return { status: 'pending', message: 'Ожидается подтверждение номера в Telegram...' };
    }

    if (session.status === 'verified' && session.phone) {
      // Если токены для этой сессии уже сгенерированы, возвращаем их
      if (session.tokens) {
        return {
          status: 'verified',
          ...session.tokens
        };
      }

      const cleanPhone = session.phone;
      const formattedPhoneWithPlus = `+${cleanPhone}`;

      // Поиск пользователя по номеру телефона (с плюсом или без)
      let user = await db.select().from(users).where(
        or(
          eq(users.phoneNumber, cleanPhone),
          eq(users.phoneNumber, formattedPhoneWithPlus)
        )
      ).get();

      // Если пользователь с таким номером не найден - автоматически регистрируем нового
      if (!user) {
        const salt = await bcrypt.genSalt(10);
        const randomPassword = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(randomPassword, salt);
        const telegramEmail = `tg_${cleanPhone}@cinema.local`;

        const inserted = await db.insert(users).values({
          email: telegramEmail,
          passwordHash,
          role: 'client',
          firstName: 'Пользователь',
          lastName: 'Telegram',
          phoneNumber: formattedPhoneWithPlus
        }).returning();

        user = inserted[0];
      }

      // Генерация JWT токенов
      const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me-in-production';
      const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-refresh-secret-key-change-me-in-production';

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id, email: user.email },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      // Сохраняем refresh token в БД
      await db.update(users)
        .set({ refreshToken })
        .where(eq(users.id, user.id));

      const authResult = {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber
        }
      };

      // Кэшируем результат в сессии
      session.tokens = authResult;
      session.userId = user.id;

      return {
        status: 'verified',
        ...authResult
      };
    }

    return { status: session.status };
  }
}
