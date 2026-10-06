import { snapshotAccounts, positions, accounts } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const MOVE_NOT_IN_SNAPSHOT_ERROR = '目标账户不在同一份数据里';
export const MOVE_DUPLICATE_INSTRUMENT_ERROR = '目标账户已持有这只标的';

export function isTargetInSameSnapshot(
  positionSnapshotId: string,
  targetAccountId: string,
  members: Array<{ snapshotId: string; accountId: string }>,
): boolean {
  return members.some(
    row => row.snapshotId === positionSnapshotId && row.accountId === targetAccountId,
  );
}

export function hasSameInstrumentInTarget(
  rows: Array<{ instrumentId: string }>,
  instrumentId: string,
): boolean {
  return rows.some(row => row.instrumentId === instrumentId);
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: unknown };
  if (e.code === '23505') return true;
  if (e.cause && typeof e.cause === 'object' && (e.cause as { code?: unknown }).code === '23505') {
    return true;
  }
  return false;
}

type MoveTx = {
  select: ReturnType<typeof import('@/db/client').getPoolDb>['select'];
  update: ReturnType<typeof import('@/db/client').getPoolDb>['update'];
};

export type MovePositionOk = {
  ok: true;
  snapshotId: string;
  fromAccountId: string;
  toAccountId: string;
};

export type MovePositionFail = {
  ok: false;
  status: number;
  error: string;
};

export async function movePositionToAccount(
  tx: MoveTx,
  positionId: string,
  accountId: string,
): Promise<MovePositionOk | MovePositionFail> {
  const existing = await tx
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  if (existing.length === 0) {
    return { ok: false, status: 404, error: '持仓不存在' };
  }

  const position = existing[0];
  if (position.accountId === accountId) {
    return {
      ok: true,
      snapshotId: position.snapshotId,
      fromAccountId: position.accountId,
      toAccountId: accountId,
    };
  }

  const accountRows = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (accountRows.length === 0) {
    return { ok: false, status: 400, error: '账户不存在' };
  }

  const membership = await tx
    .select({
      snapshotId: snapshotAccounts.snapshotId,
      accountId: snapshotAccounts.accountId,
    })
    .from(snapshotAccounts)
    .where(and(
      eq(snapshotAccounts.snapshotId, position.snapshotId),
      eq(snapshotAccounts.accountId, accountId),
    ))
    .limit(1);

  if (!isTargetInSameSnapshot(position.snapshotId, accountId, membership)) {
    return { ok: false, status: 409, error: MOVE_NOT_IN_SNAPSHOT_ERROR };
  }

  const sameInstrument = await tx
    .select({ instrumentId: positions.instrumentId })
    .from(positions)
    .where(and(
      eq(positions.snapshotId, position.snapshotId),
      eq(positions.accountId, accountId),
      eq(positions.instrumentId, position.instrumentId),
    ))
    .limit(1);

  if (hasSameInstrumentInTarget(sameInstrument, position.instrumentId)) {
    return { ok: false, status: 409, error: MOVE_DUPLICATE_INSTRUMENT_ERROR };
  }

  try {
    await tx
      .update(positions)
      .set({ accountId })
      .where(eq(positions.id, positionId));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, status: 409, error: MOVE_DUPLICATE_INSTRUMENT_ERROR };
    }
    throw error;
  }

  return {
    ok: true,
    snapshotId: position.snapshotId,
    fromAccountId: position.accountId,
    toAccountId: accountId,
  };
}
