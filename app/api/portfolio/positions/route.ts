import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { snapshots, accounts, instruments, positions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const { asOf, accountName, positions: positionsData } = body;

    if (!asOf || !accountName || !positionsData || positionsData.length === 0) {
      return NextResponse.json(
        { error: '需要 asOf, accountName, positions' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();

    // 获取或创建账户
    const accountRecords = await db
      .select()
      .from(accounts)
      .where(eq(accounts.name, accountName))
      .limit(1);

    let accountId: string;
    if (accountRecords.length === 0) {
      const [newAccount] = await db
        .insert(accounts)
        .values({
          name: accountName,
          type: 'tokutei',
        })
        .returning();
      accountId = newAccount.id;
    } else {
      accountId = accountRecords[0].id;
    }

    // 创建快照
    const [snapshot] = await db
      .insert(snapshots)
      .values({
        asOf,
        source: 'manual',
      })
      .returning();

    // 创建各持仓
    for (const pos of positionsData) {
      // 获取或创建 Instrument
      const instrumentRecords = await db
        .select()
        .from(instruments)
        .where(eq(instruments.symbol, pos.symbol))
        .limit(1);

      let instrumentId: string;
      if (instrumentRecords.length === 0) {
        const [newInstrument] = await db
          .insert(instruments)
          .values({
            symbol: pos.symbol,
            name: pos.name,
            assetClass: pos.assetClass || 'other',
            currency: pos.currency || 'JPY',
            unitBasis: pos.unitBasis || '1',
          })
          .returning();
        instrumentId = newInstrument.id;
      } else {
        instrumentId = instrumentRecords[0].id;
      }

      // Position 作成
      await db.insert(positions).values({
        snapshotId: snapshot.id,
        accountId,
        instrumentId,
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        price: pos.price,
        fxRateToJpy: pos.fxRateToJpy || '1',
      });
    }

    return NextResponse.json(
      { snapshotId: snapshot.id, created: positionsData.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Create positions error:', error);
    return NextResponse.json(
      { error: '创建持仓失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
