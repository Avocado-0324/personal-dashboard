import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

neonConfig.webSocketConstructor = ws;

let _httpDb: ReturnType<typeof drizzleHttp> | null = null;
let _pool: Pool | null = null;
let _poolDb: ReturnType<typeof drizzleWs> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  
  if (!_httpDb) {
    const sql = neon(process.env.DATABASE_URL);
    _httpDb = drizzleHttp(sql, { schema });
  }
  
  return _httpDb;
}

export function getPoolDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  
  if (!_poolDb) {
    if (!_pool) {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    _poolDb = drizzleWs(_pool, { schema });
  }
  
  return _poolDb;
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
