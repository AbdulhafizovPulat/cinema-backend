import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Расширяем стандартный тип Request в Express, чтобы добавить туда свойство user
export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: 'client' | 'admin';
  };
}

/**
 * Middleware для аутентификации JWT токена.
 * Извлекает токен из заголовка Authorization (формат "Bearer <token>").
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  // Токен передается в формате "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен отсутствует. Доступ запрещен.' });
  }

  const secret = process.env.JWT_SECRET || 'super-secret-key-change-me-in-production';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Неверный или просроченный токен.' });
    }
    // Записываем данные о пользователе в request для последующего использования в эндпоинтах
    req.user = decoded as AuthRequest['user'];
    next();
  });
}

/**
 * Middleware для проверки роли пользователя.
 * Разрешает доступ только если роль пользователя совпадает с требуемой.
 */
export function requireRole(role: 'client' | 'admin') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Пользователь не авторизован.' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Недостаточно прав для выполнения операции.' });
    }

    next();
  };
}
