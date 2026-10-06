import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { snapshots, accounts, instruments, positions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { recordSnapshotAccounts } from '@/modules/portfolio/snapshot-accounts';
import { isCurrencyCode } from '@/lib/validation';

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

    for (const pos of positionsData) {
      if (pos.currency && !isCurrencyCode(pos.currency)) {
        return NextResponse.json(
          { error: 'currency 必须是 3 位大写字母' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const db = getPoolDb();
    let snapshotId = '';

    await db.transaction(async (tx) => {
      const accountRecords = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.name, accountName))
        .limit(1);

      let accountId: string;
      if (accountRecords.length === 0) {
        const [newAccount] = await tx
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

      const [snapshot] = await tx
        .insert(snapshots)
        .values({
          asOf,
          source: 'manual',
        })
        .returning();
      snapshotId = snapshot.id;

      for (const pos of positionsData) {
        const currency = pos.currency || 'JPY';
        const instrumentRecords = await tx
          .select()
          .from(instruments)
          .where(and(
            eq(instruments.symbol, pos.symbol),
            eq(instruments.currency, currency),
          ))
          .limit(1);

        let instrumentId: string;
        if (instrumentRecords.length === 0) {
          const [newInstrument] = await tx
            .insert(instruments)
            .values({
              symbol: pos.symbol,
              name: pos.name,
              assetClass: pos.assetClass || 'other',
              currency,
              unitBasis: pos.unitBasis || '1',
            })
            .returning();
          instrumentId = newInstrument.id;
        } else {
          instrumentId = instrumentRecords[0].id;
        }

        await tx.insert(positions).values({
          snapshotId: snapshot.id,
          accountId,
          instrumentId,
          quantity: pos.quantity,
          avgCost: pos.avgCost,
          price: pos.price,
          fxRateToJpy: pos.fxRateToJpy || (currency === 'JPY' ? '1' : null),
        });
      }

      await recordSnapshotAccounts(tx, snapshot.id, [accountId]);
    });

    return NextResponse.json(
      { snapshotId, created: positionsData.length },
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
