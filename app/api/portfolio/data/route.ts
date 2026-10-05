import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions, cashBalances } from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { getLatestSnapshotsByAccount } from '@/modules/portfolio/queries';

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

    // 获取每个账户的最新快照信息
    const latestSnapshotsByAccount = await getLatestSnapshotsByAccount();
    const latestSnapshotIds = latestSnapshotsByAccount.map(s => s.snapshotId);

    // 获取最近的快照（用于显示历史）
    const recentSnapshots = await db
      .select()
      .from(snapshots)
      .orderBy(desc(snapshots.asOf), desc(snapshots.createdAt))
      .limit(10);

    // 获取所有账户的最新持仓（每个账户取其最新快照）
    let allPositions: any[] = [];
    let allCashBalances: any[] = [];
    
    if (latestSnapshotIds.length > 0) {
      allPositions = await db
        .select({
          position: positions,
          account: accounts,
          instrument: instruments,
        })
        .from(positions)
        .innerJoin(accounts, eq(positions.accountId, accounts.id))
        .innerJoin(instruments, eq(positions.instrumentId, instruments.id))
        .where(inArray(positions.snapshotId, latestSnapshotIds));
      
      allCashBalances = await db
        .select({
          cash: cashBalances,
          account: accounts,
        })
        .from(cashBalances)
        .innerJoin(accounts, eq(cashBalances.accountId, accounts.id))
        .where(inArray(cashBalances.snapshotId, latestSnapshotIds));
    }

    return NextResponse.json(
      {
        accounts: allAccounts,
        snapshots: recentSnapshots,
        positions: allPositions,
        cashBalances: allCashBalances,
        accountSnapshots: latestSnapshotsByAccount, // 每个账户的 asOf
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
