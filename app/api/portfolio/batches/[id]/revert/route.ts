import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { importBatches, snapshots, positions, cashBalances, cashFlows } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的批次 id' },
        { status: 400 }
      );
    }
    
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const db = getPoolDb();

    // 检查批次是否存在
    const batches = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, id))
      .limit(1);
    
    const batch = batches[0];

    if (!batch) {
      return NextResponse.json(
        { error: '批次不存在' },
        { status: 404 }
      );
    }

    if (batch.status === 'reverted') {
      return NextResponse.json(
        { error: '批次已撤销' },
        { status: 400 }
      );
    }

    // 在事务中删除该批次的所有数据
    await db.transaction(async (tx) => {
      // 获取该批次的所有快照
      const batchSnapshots = await tx
        .select()
        .from(snapshots)
        .where(eq(snapshots.batchId, id));

      // 删除所有快照关联的持仓和现金余额
      for (const snapshot of batchSnapshots) {
        await tx.delete(positions).where(eq(positions.snapshotId, snapshot.id));
        await tx.delete(cashBalances).where(eq(cashBalances.snapshotId, snapshot.id));
      }

      // 删除快照
      await tx.delete(snapshots).where(eq(snapshots.batchId, id));
      
      // 删除现金流
      await tx.delete(cashFlows).where(eq(cashFlows.batchId, id));

      // 更新批次状态
      await tx
        .update(importBatches)
        .set({ status: 'reverted' })
        .where(eq(importBatches.id, id));
    });

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Revert batch error:', error);
    return NextResponse.json(
      { error: '撤销失败' },
      { status: 500 }
    );
  }
}
