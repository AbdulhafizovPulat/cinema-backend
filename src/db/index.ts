import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';
import dotenv from 'dotenv';

// Загружаем переменные окружения из файла .env для локальной работы
dotenv.config();

let _db: any = null;

/**
 * Прокси-объект для динамической инициализации базы данных.
 * В Cloudflare Workers (production) использует D1-базу данных через глобальный биндинг `cinema_db`.
 * Локально (development) использует LibSQL клиент с файлом `cinema.db`.
 */
export const db = new Proxy({}, {
  get(target, prop, receiver) {
    if (!_db) {
      // Определяем, запущены ли мы в среде Cloudflare Workers
      const isCF = typeof globalThis !== 'undefined' && (
        'WebSocketPair' in globalThis || 
        'cinema_db' in globalThis || 
        (globalThis as any).MINIFLARE === true
      );

      if (isCF && (globalThis as any).cinema_db) {
        // Инициализируем Drizzle для Cloudflare D1
        _db = drizzleD1((globalThis as any).cinema_db, { schema });
      } else {
        // Инициализируем Drizzle для локального SQLite (через LibSQL)
        const dbPath = process.env.DATABASE_URL || 'file:cinema.db';
        const client = createClient({ url: dbPath });
        _db = drizzleLibsql(client, { schema });
      }
    }
    return Reflect.get(_db, prop, receiver);
  }
}) as any;

export type DbClient = typeof db;
