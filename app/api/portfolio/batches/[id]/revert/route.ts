import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { importBatches, snapshots, cashFlows } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const db = getDb();

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

    // 删除该批次的所有快照和现金流
    await db.delete(snapshots).where(eq(snapshots.batchId, id));
    await db.delete(cashFlows).where(eq(cashFlows.batchId, id));

    // 更新批次状态
    await db
      .update(importBatches)
      .set({ status: 'reverted' })
      .where(eq(importBatches.id, id));

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
