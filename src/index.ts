import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';

// Импорт БД и схемы
import { db } from './db/index.js';

// Импорт маршрутов (роутеров) модулей
import authRoutes from './modules/auth/auth.routes.js';
import moviesRoutes from './modules/movies/movies.routes.js';
import purchasesRoutes from './modules/purchases/purchases.routes.js';
import categoriesRoutes from './modules/categories/categories.routes.js';
import usersRoutes from './modules/users/users.routes.js';

// Импорт конфигурации Swagger
import { swaggerSpec } from './swagger.js';

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware глобального уровня
app.use(cors()); // Разрешает кросс-доменные запросы (CORS)
app.use(express.json()); // Автоматически парсит входящий JSON в req.body

const isCF = typeof globalThis !== 'undefined' && (
  'WebSocketPair' in globalThis || 
  'cinema_db' in globalThis || 
  (globalThis as any).MINIFLARE === true
);

// Автоматический запуск миграций базы данных при запуске приложения (только локально)
if (!isCF) {
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

// Простейший корневой маршрут для проверки статуса сервера
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Бэкенд онлайн-кинотеатра запущен успешно!',
    docs: isCF ? '/api/docs' : `http://localhost:${PORT}/api/docs`
  });
});

const server = createServer(app);

// В Cloudflare Workers порт выступает как ключ маршрутизации для обработчика.
server.listen(PORT, () => {
  if (!isCF) {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
  }
});

let exportHandler: any = null;

if (isCF) {
  const { httpServerHandler } = await import('cloudflare:node');
  exportHandler = httpServerHandler({ port: Number(PORT) });
}

export default exportHandler;
