import express from 'express';
import dotenv from 'dotenv';

// Импорт БД и схемы
import { db } from './db/index.js';

// Импорт маршрутов (роутеров) модулей
import authRoutes from './modules/auth/auth.routes.js';
import moviesRoutes from './modules/movies/movies.routes.js';
import purchasesRoutes from './modules/purchases/purchases.routes.js';
import categoriesRoutes from './modules/categories/categories.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import { TelegramLoggerService } from './modules/logger/telegram-logger.service.js';
import { rateLimiter } from './middleware/rate-limiter.js';

// Импорт конфигурации Swagger
import { swaggerSpec } from './swagger.js';

// Загрузка переменных окружения
dotenv.config();

const isCF = typeof globalThis !== 'undefined' && (
  'WebSocketPair' in globalThis || 
  'cinema_db' in globalThis || 
  (globalThis as any).MINIFLARE === true
);

// Патч Express для Cloudflare Workers: перенаправляем прототипы на нативные Node.js классы
if (isCF) {
  try {
    const httpModuleName = 'node:http';
    const nativeHttp = await import(httpModuleName);
    Object.setPrototypeOf(express.request, nativeHttp.IncomingMessage.prototype);
    Object.setPrototypeOf(express.response, nativeHttp.ServerResponse.prototype);
    console.log("► Express.request и Express.response успешно пропатчены прототипами node:http");
  } catch (err) {
    console.error("► Ошибка при патчинге прототипов Express:", err);
  }
}

const app = express();
app.disable('x-powered-by'); // Отключаем заголовок X-Powered-By для усложнения распознавания стека технологий (Fingerprinting)
const PORT = process.env.PORT || 3000;

// Middleware глобального уровня (CORS и заголовки кибербезопасности)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Базовые заголовки информационной безопасности (OWASP/Helmet эквиваленты)
  res.setHeader('X-Content-Type-Options', 'nosniff'); // Защита от MIME-sniffing
  res.setHeader('X-Frame-Options', 'DENY'); // Защита от кликджекинга (Clickjacking)
  res.setHeader('X-XSS-Protection', '1; mode=block'); // Защита от XSS-атак в старых браузерах
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // Контролирует передачу Referer
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' https://api.telegram.org;"); // CSP политика для безопасной отрисовки Swagger и API
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'); // Принудительный HTTPS (HSTS)

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  next();
});

// Middleware для автоматической отправки всех ошибок 4xx и 5xx в Telegram бот
app.use((req, res, next) => {
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (body: any) {
    const self = this;
    if (res.statusCode >= 400) {
      const errorMsg = `⚠️ [API ERROR] Произошла ошибка ${res.statusCode}
Маршрут: ${req.method} ${req.originalUrl || req.url}
Ответ: ${typeof body === 'object' ? JSON.stringify(body, null, 2) : body}`;
      
      TelegramLoggerService.log(errorMsg)
        .catch((e) => console.error("Error logging to Telegram:", e))
        .then(() => {
          originalJson.call(self, body);
        });
      return self;
    }
    return originalJson.call(this, body);
  };

  res.send = function (body: any) {
    const self = this;
    if (res.statusCode >= 400) {
      let bodyStr = body;
      if (body instanceof Buffer) {
        bodyStr = body.toString('utf8');
      } else if (typeof body === 'object') {
        bodyStr = JSON.stringify(body, null, 2);
      }
      const errorMsg = `⚠️ [API ERROR] Произошла ошибка ${res.statusCode}
Маршрут: ${req.method} ${req.originalUrl || req.url}
Ответ: ${bodyStr}`;
      
      TelegramLoggerService.log(errorMsg)
        .catch((e) => console.error("Error logging to Telegram:", e))
        .then(() => {
          originalSend.call(self, body);
        });
      return self;
    }
    return originalSend.call(this, body);
  };

  next();
});

app.use(express.json()); // Автоматически парсит входящий JSON в req.body

// Защита от спама, циклов (loop) и DDoS: 120 запросов в минуту на один IP адрес
app.use(rateLimiter({
  windowMs: 60 * 1000, // 1 минута
  max: 120             // максимум 120 запросов в минуту
}));

// Автоматический запуск миграций базы данных при запуске приложения (только локально)
if (!isCF) {
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const { migrate } = await import('drizzle-orm/libsql/migrator');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  console.log('Проверка и применение миграций базы данных...');
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, '../drizzle/migrations'),
    });
    console.log('Миграции успешно применены к локальной базе данных SQLite.');
  } catch (error) {
    console.error('Ошибка при запуске автоматических миграций:', error);
  }
}

// Подключение документации Swagger через CDN (для совместимости с Cloudflare Workers без файловой системы)
app.get('/api/docs-json', (req, res) => {
  res.json(swaggerSpec);
});

app.get('/api/docs', (req, res) => {
  const cdnSwaggerHtml = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Cinema API Documentation</title>
      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; overflow: -margin-y; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js"></script>
      <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: "/api/docs-json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "BaseLayout"
        });
        window.ui = ui;
      };
      </script>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.send(cdnSwaggerHtml);
});

console.log(`Документация API доступна по адресу: http://localhost:${PORT}/api/docs`);

// Подключение маршрутов модулей бэкенда
app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/upload', (await import('./modules/upload/upload.routes.js')).default);

// Простейший корневой маршрут для проверки статуса сервера
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Бэкенд онлайн-кинотеатра запущен успешно!',
    docs: isCF ? '/api/docs' : `http://localhost:${PORT}/api/docs`
  });
});

// Глобальный обработчик ошибок (Exception Filter)
app.use((err: any, req: any, res: any, next: any) => {
  console.error("► Критическая ошибка:", err);
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    details: err.message || String(err),
    stack: err.stack || 'Нет стека'
  });
});

// Запускаем HTTP-сервер для обработки запросов
try {
  const httpModuleName = 'node:http';
  const { createServer } = await import(httpModuleName);
  const server = createServer(app);
  server.listen(PORT, () => {
    if (!isCF) {
      console.log(`Сервер запущен и слушает порт ${PORT}`);
    }
  });
} catch (error) {
  console.warn("Предупреждение при инициализации HTTP-сервера (нормально для валидации Wrangler):", error);
}

let exportHandler: any = null;

if (isCF) {
  // @ts-ignore
  const { httpServerHandler } = await import('cloudflare:node');
  exportHandler = httpServerHandler({ port: Number(PORT) });
}

export default exportHandler;
