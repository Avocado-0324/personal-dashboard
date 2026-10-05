import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { importBatches, snapshots, accounts, instruments, positions, cashBalances, cashFlows } from '@/db/schema';
import { eq, sql, and } from 'drizzle-orm';
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

    const db = getPoolDb();

    // 检查 idempotency key（只对未撤销的批次）
    const existingBatches = await db
      .select()
      .from(importBatches)
      .where(and(
        eq(importBatches.idempotencyKey, data.idempotencyKey),
        sql`${importBatches.status} <> 'reverted'`
      ))
      .limit(1);
    
    const existingBatch = existingBatches[0];

    if (existingBatch && existingBatch.status === 'committed') {
      const importTime = new Date(existingBatch.createdAt!);
      const timeStr = importTime.toLocaleString('zh-CN', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).replace('月', '月').replace('日', '日');
      
      return NextResponse.json(
        {
          batchId: existingBatch.id,
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

    let positionsInserted = 0;
    let cashFlowsInserted = 0;
    let batchId: string;

    try {
      // 在事务中执行所有操作
      await db.transaction(async (tx) => {
        // 创建批次
      const [batch] = await tx
        .insert(importBatches)
        .values({
          source: 'screenshot',
          idempotencyKey: data.idempotencyKey,
          status: 'committed',
        })
        .returning();

      batchId = batch.id;

      // 创建快照
      const [snapshot] = await tx
        .insert(snapshots)
        .values({
          asOf: data.asOf,
          source: 'screenshot',
          batchId: batch.id,
        })
        .returning();

      // 创建账户（如果提供）
      const accountMap = new Map<string, string>();
      if (data.accounts) {
        for (const acc of data.accounts) {
          const [account] = await tx
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
            const existingAccounts = await tx
              .select()
              .from(accounts)
              .where(eq(accounts.name, pos.accountName))
              .limit(1);
            
            if (existingAccounts.length > 0) {
              accountId = existingAccounts[0].id;
            } else {
              const [newAccount] = await tx
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

          // 获取或创建 instrument（按 symbol + currency）
          const existingInstruments = await tx
            .select()
            .from(instruments)
            .where(and(
              eq(instruments.symbol, pos.symbol),
              eq(instruments.currency, pos.currency)
            ))
            .limit(1);
          
          let instrument = existingInstruments[0];

          if (!instrument) {
            [instrument] = await tx
              .insert(instruments)
              .values({
                symbol: pos.symbol,
                name: pos.name,
                assetClass: pos.assetClass,
                currency: pos.currency,
                unitBasis: pos.unitBasis || (pos.assetClass === 'fund' ? '10000' : '1'),
              })
              .returning();
          }

          await tx.insert(positions).values({
            snapshotId: snapshot.id,
            accountId,
            instrumentId: instrument.id,
            quantity: pos.quantity,
            avgCost: pos.avgCost,
            price: pos.price,
            fxRateToJpy: pos.currency === 'JPY' 
              ? (pos.fxRateToJpy && pos.fxRateToJpy !== '' ? pos.fxRateToJpy : '1')
              : (pos.fxRateToJpy && pos.fxRateToJpy !== '' ? pos.fxRateToJpy : null),
          });

          positionsInserted++;
        }
      }

      // 插入现金余额
      if (data.cashBalances) {
        for (const cash of data.cashBalances) {
          let accountId = accountMap.get(cash.accountName);
          if (!accountId) {
            const existingAccounts = await tx
              .select()
              .from(accounts)
              .where(eq(accounts.name, cash.accountName))
              .limit(1);
            
            if (existingAccounts.length > 0) {
              accountId = existingAccounts[0].id;
            } else {
              const [newAccount] = await tx
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

          await tx.insert(cashBalances).values({
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
              const existingAccounts = await tx
                .select()
                .from(accounts)
                .where(eq(accounts.name, flow.accountName))
                .limit(1);
              
              if (existingAccounts.length > 0) {
                accountId = existingAccounts[0].id;
              }
            }
          }

          await tx.insert(cashFlows).values({
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
      await tx
        .update(importBatches)
        .set({
          rowCount: positionsInserted + cashFlowsInserted,
        })
        .where(eq(importBatches.id, batch.id));
      });

      return NextResponse.json(
        {
          batchId: batchId!,
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
    } catch (txError: any) {
      // 处理唯一约束冲突（并发导入）
      if (txError?.code === '23505' && txError?.constraint?.includes('idempotency_key')) {
        // 并发冲突，重新查询已导入的批次
        const existingBatches = await db
          .select()
          .from(importBatches)
          .where(and(
            eq(importBatches.idempotencyKey, data.idempotencyKey),
            sql`${importBatches.status} <> 'reverted'`
          ))
          .limit(1);
        
        if (existingBatches.length > 0) {
          const batch = existingBatches[0];
          const importTime = new Date(batch.createdAt!);
          const timeStr = importTime.toLocaleString('zh-CN', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).replace('月', '月').replace('日', '日');
          
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
      }
      
      // 其他事务失败
      console.error('Transaction failed:', txError);
      return NextResponse.json(
        { error: 'Transaction failed' },
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

    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
