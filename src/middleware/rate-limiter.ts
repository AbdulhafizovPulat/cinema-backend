interface RateLimitData {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitData>();

/**
 * Мидлвар для защиты от DDoS и циклических (loop) запросов на стороне клиента.
 * В отличие от сторонних библиотек, данный подход полностью совместим со средой Cloudflare Workers,
 * работает с высокой скоростью и не использует запрещенные системные зависимости.
 */
export function rateLimiter(options: { windowMs: number; max: number }) {
  return (req: any, res: any, next: any) => {
    // Получаем реальный IP-адрес клиента от Cloudflare Edge
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || 'unknown';

    if (ip === 'unknown') {
      return next(); // Не блокируем запросы, если IP не был обнаружен
    }

    const now = Date.now();

    // Ленивая очисткаMap-хранилища при достижении лимита по количеству отслеживаемых IP (защита от переполнения памяти)
    if (rateLimitMap.size > 2000) {
      for (const [key, data] of rateLimitMap.entries()) {
        if (now > data.resetTime) {
          rateLimitMap.delete(key);
        }
      }
    }

    let clientData = rateLimitMap.get(ip);

    if (!clientData || now > clientData.resetTime) {
      // Инициализируем или сбрасываем окно
      clientData = {
        count: 1,
        resetTime: now + options.windowMs
      };
      rateLimitMap.set(ip, clientData);
    } else {
      clientData.count++;
    }

    // Установка стандартных заголовков лимитов запросов (OWASP recommendations)
    const remaining = Math.max(0, options.max - clientData.count);
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));

    if (clientData.count > options.max) {
      const waitSeconds = Math.ceil((clientData.resetTime - now) / 1000);
      res.setHeader('Retry-After', waitSeconds);
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Слишком много запросов. Пожалуйста, подождите ${waitSeconds} сек.`
      });
    }

    next();
  };
}
