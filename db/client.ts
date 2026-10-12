import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import type {
  FullQueryResults,
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
  NeonQueryInTransaction,
} from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Pool / WebSocket 仅给本地 migrate 与集成测用。生产写入走 HTTP，不再依赖 ws。
neonConfig.webSocketConstructor = ws;

let _sql: NeonQueryFunction<false, false> | null = null;
let _httpDb: ReturnType<typeof drizzleHttp> | null = null;
let _pool: Pool | null = null;
let _poolDb: ReturnType<typeof drizzleWs> | null = null;

function requireDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return process.env.DATABASE_URL;
}

export function getHttpSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(requireDatabaseUrl());
  }
  return _sql;
}

export async function httpTransaction(
  build: (sql: NeonQueryFunctionInTransaction<false, true>) => NeonQueryInTransaction[],
): Promise<FullQueryResults<false>[]> {
  const sql = getHttpSql();
  return sql.transaction(build, { fullResults: true });
}

export function getDb() {
  if (!_httpDb) {
    _httpDb = drizzleHttp(getHttpSql(), { schema });
  }

  return _httpDb;
}

export function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: requireDatabaseUrl() });
  }

  return _pool;
}

export function getPoolDb() {
  if (!_poolDb) {
    _poolDb = drizzleWs(getPool(), { schema });
  }

  return _poolDb;
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
