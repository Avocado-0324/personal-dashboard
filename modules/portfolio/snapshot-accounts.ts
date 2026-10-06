import { snapshotAccounts } from '@/db/schema';

type Insertable = {
  insert: ReturnType<typeof import('@/db/client').getPoolDb>['insert'];
};

export async function recordSnapshotAccounts(
  tx: Insertable,
  snapshotId: string,
  accountIds: Iterable<string>,
): Promise<void> {
  const unique = [...new Set(accountIds)].filter(Boolean);
  if (unique.length === 0) return;

  await tx.insert(snapshotAccounts).values(
    unique.map(accountId => ({ snapshotId, accountId })),
  ).onConflictDoNothing();
}
