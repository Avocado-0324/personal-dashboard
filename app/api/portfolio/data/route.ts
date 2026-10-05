import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { 
  getLatestSnapshotsByAccount, 
  getLatestPositionsByAccount, 
  getLatestCashBalancesByAccount 
} from '@/modules/portfolio/queries';

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

    // 获取最近的快照（用于显示历史）
    const recentSnapshots = await db
      .select()
      .from(snapshots)
      .orderBy(desc(snapshots.asOf), desc(snapshots.createdAt))
      .limit(10);

    // 获取所有账户的最新持仓（按账户+快照配对查询，避免重复）
    const allPositions = await getLatestPositionsByAccount();
    const allCashBalances = await getLatestCashBalancesByAccount();

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
