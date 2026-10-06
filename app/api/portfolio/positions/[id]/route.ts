import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { positions, accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { recordSnapshotAccounts } from '@/modules/portfolio/snapshot-accounts';
import { isUuid } from '@/lib/validation';
import { isUniqueViolation } from '@/db/utils';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的持仓 id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const { accountId } = body;

    if (!isUuid(accountId)) {
      return NextResponse.json(
        { error: '无效的账户 id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getPoolDb();

    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(positions)
          .where(eq(positions.id, id))
          .limit(1);

        if (existing.length === 0) {
          throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
        }

        const accountRows = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .limit(1);

        if (accountRows.length === 0) {
          throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), { code: 'ACCOUNT_NOT_FOUND' });
        }

        await tx
          .update(positions)
          .set({ accountId })
          .where(eq(positions.id, id));

        await recordSnapshotAccounts(tx, existing[0].snapshotId, [accountId]);
      });
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: '持仓不存在' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (code === 'ACCOUNT_NOT_FOUND') {
        return NextResponse.json(
          { error: '账户不存在' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (isUniqueViolation(error, 'positions_snapshot_account_instrument_unique')) {
        return NextResponse.json(
          { error: '目标账户已有同一标的' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Update position error:', error);
    return NextResponse.json(
      { error: '更新持仓失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
