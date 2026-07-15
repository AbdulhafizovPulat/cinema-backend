import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running migrations...');

try {
  // Запуск миграций из папки drizzle/migrations (асинхронно для LibSQL)
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../drizzle/migrations'),
  });
  console.log('Migrations applied successfully!');
} catch (error) {
  console.error('Error applying migrations:', error);
  process.exit(1);
}
export {};
