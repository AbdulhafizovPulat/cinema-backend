import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me-in-production';

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

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хэшируем пароль для безопасного хранения в БД
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Устанавливаем роль (client по умолчанию)
    const userRole = role === 'admin' ? 'admin' : 'client';

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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Ищем пользователя в БД
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    // Сверяем хэши паролей
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    // Генерируем JWT токен, вшивая в него id, email и роль пользователя
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' } // Срок действия токена
    );

    return res.json({
      message: 'Авторизация успешна',
      token,
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

export default router;
