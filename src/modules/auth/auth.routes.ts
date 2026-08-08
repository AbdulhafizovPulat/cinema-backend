import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { TelegramLoggerService } from '../logger/telegram-logger.service.js';
import { authenticateToken, requireRole, AuthRequest } from './auth.middleware.js';
import { LoginLimiterService } from './login-limiter.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-refresh-secret-key-change-me-in-production';

/**
 * Регистрация нового пользователя.
 * Принимает email, password и опционально role (по умолчанию client).
 */
router.post('/register', async (req, res): Promise<any> => {
  try {
    const { email, password, role, firstName, lastName, phoneNumber, cardNumber } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    if (!firstName || !lastName || !phoneNumber) {
      return res.status(400).json({ error: 'Имя, Фамилия и номер телефона обязательны' });
    }

    // Валидация формата email для предотвращения инъекций и некорректных типов данных
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Некорректный формат email.' });
    }

    // Защита от коротких паролей (базовая устойчивость к брутфорсу)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов.' });
    }

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хэшируем пароль для безопасного хранения в БД
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Безопасная инициализация роли: предотвращение Privilege Escalation.
    // Обычная регистрация позволяет создавать только аккаунты с ролью client.
    // Регистрация роли admin допустима только с правильным ключом ADMIN_REGISTRATION_SECRET.
    const adminSecret = process.env.ADMIN_REGISTRATION_SECRET || (globalThis as any).ADMIN_REGISTRATION_SECRET;
    let userRole: 'client' | 'admin' = 'client';
    if (role === 'admin') {
      const { adminSecretKey } = req.body;
      if (adminSecret && adminSecretKey === adminSecret) {
        userRole = 'admin';
      } else {
        return res.status(403).json({ error: 'Недостаточно прав для регистрации администратора.' });
      }
    }

    // Сохраняем пользователя в базу данных
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
    });

    const newUser = result[0];

    return res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: newUser,
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Авторизация пользователя (вход).
 * Проверяет email и пароль, возвращает JWT токен в случае успеха.
 */
router.post('/login', async (req, res): Promise<any> => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Проверяем блокировку от перебора паролей (Brute-Force Limit)
    const { locked, remainingSeconds } = LoginLimiterService.isLockedOut(cleanEmail);
    if (locked) {
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      await TelegramLoggerService.log(`⚠️ [AUTH] Блокировка входа для ${cleanEmail}: Превышен лимит неудачных попыток.`);
      return res.status(429).json({
        error: 'Слишком много попыток входа',
        message: `Превышено количество попыток входа (максимум 5). Доступ временно заблокирован на ${remainingMinutes} мин.`,
        remainingSeconds
      });
    }

    // Ищем пользователя в БД
    const user = await db.select().from(users).where(eq(users.email, cleanEmail)).get();
    if (!user) {
      const { attempts, locked: justLocked, remainingSeconds: remSec } = LoginLimiterService.recordFailedAttempt(cleanEmail);
      if (justLocked) {
        await TelegramLoggerService.log(`🚨 [AUTH] Достигнут лимит попыток для: ${cleanEmail}. Аккаунт заблокирован на 15 минут.`);
        return res.status(429).json({
          error: 'Слишком много попыток входа',
          message: 'Достигнут лимит неудачных попыток входа (5/5). Аккаунт заблокирован на 15 минут.',
          remainingSeconds: remSec
        });
      }
      await TelegramLoggerService.log(`⚠️ [AUTH] Неудачная попытка входа: ${cleanEmail} (Попытка ${attempts} из 5)`);
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    // Сверяем хэши паролей
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const { attempts, locked: justLocked, remainingSeconds: remSec } = LoginLimiterService.recordFailedAttempt(cleanEmail);
      if (justLocked) {
        await TelegramLoggerService.log(`🚨 [AUTH] Достигнут лимит попыток для: ${cleanEmail}. Аккаунт заблокирован на 15 минут.`);
        return res.status(429).json({
          error: 'Слишком много попыток входа',
          message: 'Достигнут лимит неудачных попыток входа (5/5). Аккаунт заблокирован на 15 минут.',
          remainingSeconds: remSec
        });
      }
      await TelegramLoggerService.log(`⚠️ [AUTH] Неудачная попытка входа: ${cleanEmail} (Попытка ${attempts} из 5)`);
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    // Успешный вход -> Сбрасываем счетчик ошибочных попыток
    LoginLimiterService.resetAttempts(cleanEmail);

    // Генерируем JWT токен, вшивая в него id, email и роль пользователя
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' } // Срок действия access токена сокращен до 15 минут
    );

    // Генерируем Refresh токен
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' } // Срок действия refresh токена - 7 дней
    );

    // Сохраняем refresh token в базе данных
    await db.update(users)
      .set({ refreshToken })
      .where(eq(users.id, user.id));

    await TelegramLoggerService.log(`🔑 [AUTH] Успешный вход пользователя: ${user.email} (Роль: ${user.role})`);

    return res.json({
      message: 'Авторизация успешна',
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/auth/reset-attempts
 * Сброс счетчика неудачных попыток входа для конкретного email или всех аккаунтов.
 */
router.post('/reset-attempts', async (req, res): Promise<any> => {
  try {
    const { email } = req.body || {};
    LoginLimiterService.resetAttempts(email);
    const target = email ? String(email).trim().toLowerCase() : 'всех аккаунтов';
    await TelegramLoggerService.log(`🔄 [AUTH] Сброшен лимит попыток входа для: ${target}`);
    return res.json({
      message: `Лимит попыток входа успешно сброшен для ${target}`
    });
  } catch (error) {
    console.error('Ошибка при сбросе лимита попыток:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Запрос сброса пароля (Forgot Password).
 * Генерирует временный токен сброса пароля, привязанный к текущему хэшу пароля.
 */
router.post('/forgot-password', async (req, res): Promise<any> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    // Ищем пользователя
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' });
    }

    // Секретный ключ для этого токена делаем уникальным на основе текущего пароля пользователя.
    // Если пользователь сменит пароль, токен сброса автоматически станет недействительным!
    const secret = JWT_SECRET + user.passwordHash;
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '15m' });

    // В реальном проекте мы бы отправили email с ссылкой, содержащей этот токен.
    // Но так как это бэкенд без интеграции с почтовым сервисом, вернем токен прямо в ответе.
    return res.json({
      message: 'Ссылка для сброса пароля сгенерирована (в продакшене отправляется на почту)',
      resetToken: token,
      resetLink: `http://localhost:3000/api/auth/reset-password?token=${token}`
    });
  } catch (error) {
    console.error('Ошибка в forgot-password:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Подтверждение сброса пароля (Reset Password).
 * Проверяет временный токен и устанавливает новый пароль.
 */
router.post('/reset-password', async (req, res): Promise<any> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Токен и новый пароль обязательны' });
    }

    // Декодируем токен без валидации подписи, чтобы узнать, для какого юзера он был создан
    const decoded = jwt.decode(token) as { id: number; email: string } | null;
    if (!decoded || !decoded.id) {
      return res.status(400).json({ error: 'Неверный формат токена' });
    }

    // Ищем пользователя
    const user = await db.select().from(users).where(eq(users.id, decoded.id)).get();
    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    // Теперь проверяем подпись токена, используя секрет, содержащий старый хэш пароля
    const secret = JWT_SECRET + user.passwordHash;
    try {
      jwt.verify(token, secret);
    } catch (err) {
      return res.status(400).json({ error: 'Токен недействителен, изменен или истек его срок действия' });
    }

    // Хэшируем новый пароль
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Обновляем пароль в базе данных
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    return res.json({
      message: 'Пароль успешно изменен. Теперь вы можете войти с новым паролем.',
    });
  } catch (error) {
    console.error('Ошибка в reset-password:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/auth/verify-admin
 * Проверка прав доступа в административную панель.
 * Возвращает 200 OK если пользователь авторизован и имеет роль 'admin'.
 * Возвращает 403 Forbidden если пользователь авторизован, но его роль 'client'.
 */
router.get('/verify-admin', authenticateToken, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<any> => {
  return res.json({
    status: 'ok',
    message: 'Доступ разрешен',
    user: req.user,
  });
});

/**
 * Обновление access токена по refresh токену.
 */
router.post('/refresh', async (req, res): Promise<any> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token обязателен' });
    }

    // Проверяем валидность refresh токена
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ error: 'Неверный или просроченный refresh token' });
    }

    if (!decoded || !decoded.id) {
      return res.status(403).json({ error: 'Недействительный формат refresh токена' });
    }

    // Ищем пользователя в БД
    const user = await db.select().from(users).where(eq(users.id, decoded.id)).get();
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Сверяем токен с тем, что в БД
    if (user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Refresh token не совпадает или аннулирован' });
    }

    // Генерируем новую пару токенов
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Обновляем refresh token в БД для безопасности (ротация)
    await db.update(users)
      .set({ refreshToken: newRefreshToken })
      .where(eq(users.id, user.id));

    return res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Выход из системы с аннулированием refresh токена.
 */
router.post('/logout', authenticateToken, async (req: AuthRequest, res): Promise<any> => {
  try {
    if (req.user) {
      await db.update(users)
        .set({ refreshToken: null })
        .where(eq(users.id, req.user.id));
    }
    return res.json({ message: 'Вы успешно вышли из системы' });
  } catch (error) {
    console.error('Ошибка выхода из системы:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
