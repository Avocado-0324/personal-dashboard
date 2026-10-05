import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  
  return _db;
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
