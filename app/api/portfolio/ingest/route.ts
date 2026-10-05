import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { importBatches, snapshots, accounts, instruments, positions, cashBalances, cashFlows } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';

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
    currency: z.string().length(3),
    quantity: z.string(),
    avgCost: z.string(),
    price: z.string(),
    fxRateToJpy: z.string().optional(),
    unitBasis: z.string().optional(),
  })).optional(),
  cashBalances: z.array(z.object({
    accountName: z.string(),
    currency: z.string().length(3),
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

export async function POST(request: NextRequest) {
  try {
    // 验证密钥
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.PORTFOLIO_INGEST_KEY;

    if (!expectedKey || expectedKey.length < 32) {
      console.error('PORTFOLIO_INGEST_KEY not configured or too short');
      return NextResponse.json(
        { error: 'Server configuration error' },
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
    
    // 长度检查，避免 timingSafeEqual throw
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
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const data = IngestSchema.parse(body);

    const db = getDb();

    // 检查 idempotency key
    const existingBatches = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.idempotencyKey, data.idempotencyKey))
      .limit(1);
    
    const existingBatch = existingBatches[0];

    if (existingBatch) {
      // 返回之前的结果
      return NextResponse.json(
        {
          batchId: existingBatch.id,
          inserted: {
            positions: 0,
            cashFlows: 0,
            message: 'Already processed',
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // 创建批次
    const [batch] = await db
      .insert(importBatches)
      .values({
        source: 'screenshot',
        idempotencyKey: data.idempotencyKey,
        status: 'committed',
      })
      .returning();

    // 创建快照
    const [snapshot] = await db
      .insert(snapshots)
      .values({
        asOf: data.asOf,
        source: 'screenshot',
        batchId: batch.id,
      })
      .returning();

    let positionsInserted = 0;
    let cashFlowsInserted = 0;

    // 创建账户（如果提供）
    const accountMap = new Map<string, string>();
    if (data.accounts) {
      for (const acc of data.accounts) {
        const [account] = await db
          .insert(accounts)
          .values(acc)
          .returning();
        accountMap.set(acc.name, account.id);
      }
    }

    // 插入持仓
    if (data.positions) {
      for (const pos of data.positions) {
        // 获取或创建账户
        let accountId = accountMap.get(pos.accountName);
        if (!accountId) {
          const existingAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.name, pos.accountName))
            .limit(1);
          
          if (existingAccounts.length > 0) {
            accountId = existingAccounts[0].id;
          } else {
            const [newAccount] = await db
              .insert(accounts)
              .values({
                name: pos.accountName,
                type: 'other',
              })
              .returning();
            accountId = newAccount.id;
            accountMap.set(pos.accountName, accountId);
          }
        }

        // 获取或创建 instrument
        const existingInstruments = await db
          .select()
          .from(instruments)
          .where((t) => {
            // 使用 SQL 条件
            return sql`${t.symbol} = ${pos.symbol} AND ${t.currency} = ${pos.currency}`;
          })
          .limit(1);
        
        let instrument = existingInstruments[0];

        if (!instrument) {
          [instrument] = await db
            .insert(instruments)
            .values({
              symbol: pos.symbol,
              name: pos.name,
              assetClass: pos.assetClass,
              currency: pos.currency,
              unitBasis: pos.unitBasis || '1',
            })
            .returning();
        }

        await db.insert(positions).values({
          snapshotId: snapshot.id,
          accountId,
          instrumentId: instrument.id,
          quantity: pos.quantity,
          avgCost: pos.avgCost,
          price: pos.price,
          fxRateToJpy: pos.fxRateToJpy || '1',
        });

        positionsInserted++;
      }
    }

    // 插入现金余额
    if (data.cashBalances) {
      for (const cash of data.cashBalances) {
        let accountId = accountMap.get(cash.accountName);
        if (!accountId) {
          const existingAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.name, cash.accountName))
            .limit(1);
          
          if (existingAccounts.length > 0) {
            accountId = existingAccounts[0].id;
          } else {
            const [newAccount] = await db
              .insert(accounts)
              .values({
                name: cash.accountName,
                type: 'cash',
              })
              .returning();
            accountId = newAccount.id;
            accountMap.set(cash.accountName, accountId);
          }
        }

        await db.insert(cashBalances).values({
          snapshotId: snapshot.id,
          accountId,
          currency: cash.currency,
          amount: cash.amount,
          fxRateToJpy: cash.fxRateToJpy && cash.fxRateToJpy !== ''
            ? cash.fxRateToJpy
            : (cash.currency === 'JPY' ? '1' : null),
        });
      }
    }

    // 插入现金流
    if (data.cashFlows) {
      for (const flow of data.cashFlows) {
        let accountId: string | null = null;
        
        if (flow.accountName) {
          accountId = accountMap.get(flow.accountName) || null;
          if (!accountId) {
            const existingAccounts = await db
              .select()
              .from(accounts)
              .where(eq(accounts.name, flow.accountName))
              .limit(1);
            
            if (existingAccounts.length > 0) {
              accountId = existingAccounts[0].id;
            }
          }
        }

        await db.insert(cashFlows).values({
          accountId,
          date: flow.date,
          direction: flow.direction,
          amountJpy: flow.amountJpy,
          note: flow.note,
          source: 'screenshot',
          batchId: batch.id,
        });

        cashFlowsInserted++;
      }
    }

    // 更新批次的行数
    await db
      .update(importBatches)
      .set({
        rowCount: positionsInserted + cashFlowsInserted,
      })
      .where(eq(importBatches.id, batch.id));

    return NextResponse.json(
      {
        batchId: batch.id,
        inserted: {
          positions: positionsInserted,
          cashFlows: cashFlowsInserted,
        },
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
