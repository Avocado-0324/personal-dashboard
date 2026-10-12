import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { importBatches } from '@/db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import { CURRENCY_RE } from '@/lib/validation';
import { logWriteError } from '@/lib/write-error-log';
import {
  IdempotentConflictError,
  commitIngest,
  formatImportTimeZh,
} from '@/modules/portfolio/http-writes';

const INGEST_ROUTE = '/api/portfolio/ingest';

export const dynamic = 'force-dynamic';

const IngestSchema = z.object({
  idempotencyKey: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.literal('screenshot'),
  accounts: z.array(z.object({
    name: z.string(),
    type: z.enum(['tokutei', 'nisa_growth', 'nisa_tsumitate', 'cash', 'other']),
    broker: z.string().optional(),
  })).optional(),
  positions: z.array(z.object({
    accountName: z.string(),
    symbol: z.string(),
    name: z.string(),
    assetClass: z.enum(['jp_stock', 'us_stock', 'fund', 'etf', 'bond', 'reit', 'crypto', 'other']),
    currency: z.string().regex(CURRENCY_RE),
    quantity: z.string(),
    avgCost: z.string(),
    price: z.string(),
    fxRateToJpy: z.string().optional(),
    unitBasis: z.string().optional(),
  })).optional(),
  cashBalances: z.array(z.object({
    accountName: z.string(),
    currency: z.string().regex(CURRENCY_RE),
    amount: z.string(),
    fxRateToJpy: z.string().optional(),
  })).optional(),
  cashFlows: z.array(z.object({
    accountName: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    direction: z.enum(['deposit', 'withdrawal']),
    amountJpy: z.string(),
    note: z.string().optional(),
  })).optional(),
}).strict();

function alreadyImportedResponse(batch: { id: string; createdAt: Date | null }) {
  const timeStr = formatImportTimeZh(batch.createdAt);
  return NextResponse.json(
    {
      batchId: batch.id,
      inserted: {
        positions: 0,
        cashFlows: 0,
        message: `这个批次已经导入过（${timeStr}），没有重复写入`,
      },
      alreadyImported: true,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

async function findCommittedBatch(idempotencyKey: string) {
  const db = getDb();
  return db
    .select()
    .from(importBatches)
    .where(and(
      eq(importBatches.idempotencyKey, idempotencyKey),
      sql`${importBatches.status} <> 'reverted'`
    ))
    .limit(1);
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.PORTFOLIO_INGEST_KEY;

    if (!expectedKey || expectedKey.length < 32) {
      logWriteError(INGEST_ROUTE, 'other', new Error('PORTFOLIO_INGEST_KEY not configured or too short'));
      return NextResponse.json(
        { error: '写入失败' },
        { status: 500 }
      );
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const providedKey = authHeader.slice(7);

    const expectedBuffer = Buffer.from(expectedKey);
    const providedBuffer = Buffer.from(providedKey);

    if (expectedBuffer.length !== providedBuffer.length) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!isDatabaseConfigured()) {
      logWriteError(INGEST_ROUTE, 'write', new Error('DATABASE_URL not configured'));
      return NextResponse.json(
        { error: '写入失败' },
        { status: 500 }
      );
    }

    let data: z.infer<typeof IngestSchema>;
    try {
      const body = await request.json();
      data = IngestSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.issues },
          { status: 400 }
        );
      }
      logWriteError(INGEST_ROUTE, 'parse', error);
      return NextResponse.json(
        { error: '写入失败' },
        { status: 500 }
      );
    }

    let existingBatches: Array<typeof importBatches.$inferSelect>;
    try {
      existingBatches = await findCommittedBatch(data.idempotencyKey);
    } catch (error) {
      logWriteError(INGEST_ROUTE, 'write', error);
      return NextResponse.json(
        { error: '写入失败' },
        { status: 500 }
      );
    }

    const existingBatch = existingBatches[0];

    if (existingBatch && existingBatch.status === 'committed') {
      return alreadyImportedResponse(existingBatch);
    }

    try {
      const result = await commitIngest({
        idempotencyKey: data.idempotencyKey,
        asOf: data.asOf,
        accounts: data.accounts,
        positions: data.positions,
        cashBalances: data.cashBalances,
        cashFlows: data.cashFlows,
      });

      return NextResponse.json(
        {
          batchId: result.batchId,
          inserted: {
            positions: result.positionsInserted,
            cashFlows: result.cashFlowsInserted,
          },
        },
        {
          status: 201,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    } catch (txError) {
      if (txError instanceof IdempotentConflictError) {
        const raced = await findCommittedBatch(data.idempotencyKey);
        if (raced.length > 0) {
          return alreadyImportedResponse(raced[0]);
        }
      }

      logWriteError(INGEST_ROUTE, 'write', txError);
      return NextResponse.json(
        { error: '写入失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    logWriteError(INGEST_ROUTE, 'other', error);
    return NextResponse.json(
      { error: '写入失败' },
      { status: 500 }
    );
  }
}
