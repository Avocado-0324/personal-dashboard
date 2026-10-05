import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions, cashBalances } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();

    // 获取所有账户
    const allAccounts = await db.select().from(accounts);

    // 获取最近的快照
    const recentSnapshots = await db
      .select()
      .from(snapshots)
      .orderBy(desc(snapshots.asOf))
      .limit(10);

    // 获取最新快照的持仓
    const latestSnapshot = recentSnapshots[0];
    let allPositions: any[] = [];
    let allCashBalances: any[] = [];
    
    if (latestSnapshot) {
      allPositions = await db
        .select({
          position: positions,
          account: accounts,
          instrument: instruments,
        })
        .from(positions)
        .innerJoin(accounts, eq(positions.accountId, accounts.id))
        .innerJoin(instruments, eq(positions.instrumentId, instruments.id))
        .where(eq(positions.snapshotId, latestSnapshot.id));
      
      allCashBalances = await db
        .select({
          cash: cashBalances,
          account: accounts,
        })
        .from(cashBalances)
        .innerJoin(accounts, eq(cashBalances.accountId, accounts.id))
        .where(eq(cashBalances.snapshotId, latestSnapshot.id));
    }

    return NextResponse.json(
      {
        accounts: allAccounts,
        snapshots: recentSnapshots,
        positions: allPositions,
        cashBalances: allCashBalances,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Get data error:', error);
    return NextResponse.json(
      { error: '获取数据失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
