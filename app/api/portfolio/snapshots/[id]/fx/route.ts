import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { positions, cashBalances } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { isCurrencyCode, isFxRateString, isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的快照 id' },
        { status: 400 }
      );
    }
    
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { currency, rateToJpy } = body;

    if (!currency || !rateToJpy) {
      return NextResponse.json(
        { error: '需要 currency 和 rateToJpy' },
        { status: 400 }
      );
    }

    if (!isCurrencyCode(currency)) {
      return NextResponse.json(
        { error: 'currency 必须是 3 位大写字母' },
        { status: 400 }
      );
    }

    if (currency === 'JPY') {
      return NextResponse.json(
        { error: 'JPY 汇率不能修改' },
        { status: 400 }
      );
    }

    if (!isFxRateString(rateToJpy)) {
      return NextResponse.json(
        { error: '汇率格式无效' },
        { status: 400 }
      );
    }

    let rate: Decimal;
    try {
      rate = new Decimal(rateToJpy);
    } catch {
      return NextResponse.json(
        { error: '汇率格式无效' },
        { status: 400 }
      );
    }

    if (rate.lte(0)) {
      return NextResponse.json(
        { error: '汇率必须大于 0' },
        { status: 400 }
      );
    }

    const db = getPoolDb();
    let updatedCount = 0;

    await db.transaction(async (tx) => {
      // 查询该快照的所有指定币种的持仓
      const positionsToUpdate = await tx
        .select({ id: positions.id })
        .from(positions)
        .innerJoin(sql`(SELECT id, currency FROM instruments) AS instruments`, sql`positions.instrument_id = instruments.id`)
        .where(and(
          eq(positions.snapshotId, id),
          sql`instruments.currency = ${currency}`
        ));

      // 更新持仓汇率
      if (positionsToUpdate.length > 0) {
        for (const pos of positionsToUpdate) {
          await tx
            .update(positions)
            .set({ fxRateToJpy: rateToJpy })
            .where(eq(positions.id, pos.id));
          updatedCount++;
        }
      }

      // 更新现金余额汇率
      const cashToUpdate = await tx
        .select({ id: cashBalances.id })
        .from(cashBalances)
        .where(and(
          eq(cashBalances.snapshotId, id),
          eq(cashBalances.currency, currency)
        ));

      if (cashToUpdate.length > 0) {
        for (const cash of cashToUpdate) {
          await tx
            .update(cashBalances)
            .set({ fxRateToJpy: rateToJpy })
            .where(eq(cashBalances.id, cash.id));
          updatedCount++;
        }
      }
    });

    return NextResponse.json(
      { updatedCount },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Update FX rate error:', error);
    return NextResponse.json(
      { error: '更新失败' },
      { status: 500 }
    );
  }
}
