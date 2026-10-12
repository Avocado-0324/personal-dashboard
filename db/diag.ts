import { sql } from 'drizzle-orm';
import { getDb, getHttpSql, isDatabaseConfigured } from './client';
import { extractWriteErrorFields } from '@/lib/write-error-log';

export type DiagStepResult = {
  ok: boolean;
  ms: number;
  errorType?: string;
  message?: string;
};

function failedStep(startedAt: number, error: unknown): DiagStepResult {
  const fields = extractWriteErrorFields(error);
  return {
    ok: false,
    ms: Date.now() - startedAt,
    errorType: fields.errorType,
    message: fields.message,
  };
}

export async function probeHttpSelect1(): Promise<DiagStepResult> {
  const startedAt = Date.now();
  try {
    if (!isDatabaseConfigured()) {
      throw new Error('DATABASE_URL not configured');
    }
    const db = getDb();
    await db.execute(sql`select 1`);
    return { ok: true, ms: Date.now() - startedAt };
  } catch (error) {
    return failedStep(startedAt, error);
  }
}

export async function probeHttpTransaction(): Promise<DiagStepResult> {
  const startedAt = Date.now();
  try {
    if (!isDatabaseConfigured()) {
      throw new Error('DATABASE_URL not configured');
    }
    const neonSql = getHttpSql();
    await neonSql.transaction([
      neonSql`select 1`,
      neonSql`select 1`,
    ], { readOnly: true });
    return { ok: true, ms: Date.now() - startedAt };
  } catch (error) {
    return failedStep(startedAt, error);
  }
}
