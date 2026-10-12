import { randomUUID } from 'crypto';
import type {
  FullQueryResults,
  NeonQueryFunctionInTransaction,
  NeonQueryInTransaction,
} from '@neondatabase/serverless';
import { httpTransaction } from '@/db/client';
import { isPgUniqueViolation } from '@/db/utils';
import {
  MOVE_DUPLICATE_INSTRUMENT_ERROR,
  MOVE_NOT_IN_SNAPSHOT_ERROR,
  isUniqueConstraintError,
  type MovePositionFail,
  type MovePositionOk,
} from './move-position';

export class IdempotentConflictError extends Error {
  constructor() {
    super('IDEMPOTENT_CONFLICT');
    this.name = 'IdempotentConflictError';
  }
}

type TxSql = NeonQueryFunctionInTransaction<false, true>;

export function formatImportTimeZh(createdAt: Date | string | null | undefined): string {
  const importTime = new Date(createdAt ?? Date.now());
  return importTime.toLocaleString('zh-CN', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CsvAccountInput = {
  accountName: string;
  accountType: 'tokutei' | 'nisa_growth' | 'nisa_tsumitate';
};

export type CsvPositionInput = {
  accountName: string;
  symbol: string;
  name: string;
  assetClass: 'jp_stock' | 'fund';
  quantity: string;
  avgCost: string;
  price: string;
  unitBasis: string;
};

export type CsvImportPlan = {
  batchId: string;
  snapshotId: string;
  asOf: string;
  filename: string;
  idempotencyKey: string;
  accounts: Array<{ id: string; name: string; type: CsvAccountInput['accountType'] }>;
  instruments: Array<{
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    unitBasis: string;
  }>;
  positions: Array<{
    id: string;
    accountName: string;
    symbol: string;
    quantity: string;
    avgCost: string;
    price: string;
  }>;
};

export function planCsvImport(input: {
  asOf: string;
  filename: string;
  idempotencyKey: string;
  accountSummaries: CsvAccountInput[];
  positions: CsvPositionInput[];
}): CsvImportPlan {
  const instrumentsByKey = new Map<string, CsvImportPlan['instruments'][number]>();
  for (const pos of input.positions) {
    const key = `${pos.symbol}\0JPY`;
    if (!instrumentsByKey.has(key)) {
      instrumentsByKey.set(key, {
        id: randomUUID(),
        symbol: pos.symbol,
        name: pos.name,
        assetClass: pos.assetClass,
        unitBasis: pos.unitBasis,
      });
    }
  }

  return {
    batchId: randomUUID(),
    snapshotId: randomUUID(),
    asOf: input.asOf,
    filename: input.filename,
    idempotencyKey: input.idempotencyKey,
    accounts: input.accountSummaries.map(summary => ({
      id: randomUUID(),
      name: summary.accountName,
      type: summary.accountType,
    })),
    instruments: [...instrumentsByKey.values()],
    positions: input.positions.map(pos => ({
      id: randomUUID(),
      accountName: pos.accountName,
      symbol: pos.symbol,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      price: pos.price,
    })),
  };
}

export function buildCsvImportQueries(sql: TxSql, plan: CsvImportPlan): NeonQueryInTransaction[] {
  const queries: NeonQueryInTransaction[] = [
    sql`
      INSERT INTO import_batches (id, source, idempotency_key, filename, row_count, status)
      VALUES (${plan.batchId}::uuid, 'csv', ${plan.idempotencyKey}, ${plan.filename}, ${plan.positions.length}, 'committed')
    `,
    sql`
      INSERT INTO snapshots (id, as_of, source, batch_id)
      VALUES (${plan.snapshotId}::uuid, ${plan.asOf}, 'csv', ${plan.batchId}::uuid)
    `,
  ];

  if (plan.accounts.length > 0) {
    const ids = plan.accounts.map(a => a.id);
    const names = plan.accounts.map(a => a.name);
    const types = plan.accounts.map(a => a.type);
    queries.push(
      sql`
        UPDATE accounts AS a
        SET type = v.type
        FROM unnest(${ids}::uuid[], ${names}::text[], ${types}::text[]) AS v(id, name, type)
        WHERE a.name = v.name AND a.type IS DISTINCT FROM v.type
      `,
      sql`
        INSERT INTO accounts (id, name, type, broker)
        SELECT v.id, v.name, v.type, 'SBI'
        FROM unnest(${ids}::uuid[], ${names}::text[], ${types}::text[]) AS v(id, name, type)
        WHERE NOT EXISTS (SELECT 1 FROM accounts existing WHERE existing.name = v.name)
      `,
      sql`
        INSERT INTO snapshot_accounts (snapshot_id, account_id)
        SELECT ${plan.snapshotId}::uuid, a.id
        FROM accounts a
        WHERE a.name = ANY(${names}::text[])
        ON CONFLICT DO NOTHING
      `,
    );
  }

  if (plan.instruments.length > 0) {
    const ids = plan.instruments.map(i => i.id);
    const symbols = plan.instruments.map(i => i.symbol);
    const names = plan.instruments.map(i => i.name);
    const classes = plan.instruments.map(i => i.assetClass);
    const bases = plan.instruments.map(i => i.unitBasis);
    queries.push(sql`
      INSERT INTO instruments (id, symbol, name, asset_class, currency, unit_basis)
      SELECT v.id, v.symbol, v.name, v.asset_class, 'JPY', v.unit_basis
      FROM unnest(
        ${ids}::uuid[],
        ${symbols}::text[],
        ${names}::text[],
        ${classes}::text[],
        ${bases}::numeric[]
      ) AS v(id, symbol, name, asset_class, unit_basis)
      ON CONFLICT (symbol, currency) DO NOTHING
    `);
  }

  if (plan.positions.length > 0) {
    const ids = plan.positions.map(p => p.id);
    const accountNames = plan.positions.map(p => p.accountName);
    const symbols = plan.positions.map(p => p.symbol);
    const quantities = plan.positions.map(p => p.quantity);
    const avgCosts = plan.positions.map(p => p.avgCost);
    const prices = plan.positions.map(p => p.price);
    queries.push(sql`
      INSERT INTO positions (id, snapshot_id, account_id, instrument_id, quantity, avg_cost, price, fx_rate_to_jpy)
      SELECT v.id, ${plan.snapshotId}::uuid, a.id, i.id, v.quantity, v.avg_cost, v.price, '1'
      FROM unnest(
        ${ids}::uuid[],
        ${accountNames}::text[],
        ${symbols}::text[],
        ${quantities}::numeric[],
        ${avgCosts}::numeric[],
        ${prices}::numeric[]
      ) AS v(id, account_name, symbol, quantity, avg_cost, price)
      JOIN accounts a ON a.name = v.account_name
      JOIN instruments i ON i.symbol = v.symbol AND i.currency = 'JPY'
    `);
  }

  queries.push(sql`
    SELECT CASE
      WHEN COUNT(*) = ${plan.positions.length} THEN 1
      ELSE 1 / 0
    END AS ok
    FROM positions
    WHERE snapshot_id = ${plan.snapshotId}::uuid
  `);

  return queries;
}

export async function commitCsvImport(input: {
  asOf: string;
  filename: string;
  idempotencyKey: string;
  accountSummaries: CsvAccountInput[];
  positions: CsvPositionInput[];
}): Promise<{ batchId: string }> {
  const plan = planCsvImport(input);
  try {
    await httpTransaction(sql => buildCsvImportQueries(sql, plan));
    return { batchId: plan.batchId };
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new IdempotentConflictError();
    }
    throw error;
  }
}

export type IngestAccountInput = {
  name: string;
  type: 'tokutei' | 'nisa_growth' | 'nisa_tsumitate' | 'cash' | 'other';
  broker?: string;
};

export type IngestPositionInput = {
  accountName: string;
  symbol: string;
  name: string;
  assetClass: 'jp_stock' | 'us_stock' | 'fund' | 'etf' | 'bond' | 'reit' | 'crypto' | 'other';
  currency: string;
  quantity: string;
  avgCost: string;
  price: string;
  fxRateToJpy?: string;
  unitBasis?: string;
};

export type IngestCashBalanceInput = {
  accountName: string;
  currency: string;
  amount: string;
  fxRateToJpy?: string;
};

export type IngestCashFlowInput = {
  accountName?: string;
  date: string;
  direction: 'deposit' | 'withdrawal';
  amountJpy: string;
  note?: string;
};

function fxRateForPosition(currency: string, fxRateToJpy?: string): string | null {
  if (fxRateToJpy && fxRateToJpy !== '') return fxRateToJpy;
  return currency === 'JPY' ? '1' : null;
}

function fxRateForCash(currency: string, fxRateToJpy?: string): string | null {
  if (fxRateToJpy && fxRateToJpy !== '') return fxRateToJpy;
  return currency === 'JPY' ? '1' : null;
}

export function buildIngestQueries(
  sql: TxSql,
  input: {
    batchId: string;
    snapshotId: string;
    idempotencyKey: string;
    asOf: string;
    providedAccounts: Array<{ id: string; name: string; type: IngestAccountInput['type']; broker: string | null }>;
    extraAccountNames: string[];
    extraAccountTypes: Array<'other' | 'cash'>;
    extraAccountIds: string[];
    instruments: Array<{
      id: string;
      symbol: string;
      name: string;
      assetClass: string;
      currency: string;
      unitBasis: string;
    }>;
    positions: Array<{
      id: string;
      accountId: string | null;
      accountName: string;
      symbol: string;
      currency: string;
      quantity: string;
      avgCost: string;
      price: string;
      fxRateToJpy: string | null;
    }>;
    cashBalances: Array<{
      id: string;
      accountId: string | null;
      accountName: string;
      currency: string;
      amount: string;
      fxRateToJpy: string | null;
    }>;
    cashFlows: Array<{
      id: string;
      accountName: string | null;
      date: string;
      direction: string;
      amountJpy: string;
      note: string | null;
    }>;
    snapshotAccountIds: string[];
    snapshotAccountNames: string[];
    rowCount: number;
  },
): NeonQueryInTransaction[] {
  const queries: NeonQueryInTransaction[] = [
    sql`
      INSERT INTO import_batches (id, source, idempotency_key, status, row_count)
      VALUES (${input.batchId}::uuid, 'screenshot', ${input.idempotencyKey}, 'committed', ${input.rowCount})
    `,
    sql`
      INSERT INTO snapshots (id, as_of, source, batch_id)
      VALUES (${input.snapshotId}::uuid, ${input.asOf}, 'screenshot', ${input.batchId}::uuid)
    `,
  ];

  if (input.providedAccounts.length > 0) {
    const ids = input.providedAccounts.map(a => a.id);
    const names = input.providedAccounts.map(a => a.name);
    const types = input.providedAccounts.map(a => a.type);
    const brokers = input.providedAccounts.map(a => a.broker);
    queries.push(sql`
      INSERT INTO accounts (id, name, type, broker)
      SELECT v.id, v.name, v.type, v.broker
      FROM unnest(
        ${ids}::uuid[],
        ${names}::text[],
        ${types}::text[],
        ${brokers}::text[]
      ) AS v(id, name, type, broker)
    `);
  }

  if (input.extraAccountNames.length > 0) {
    queries.push(sql`
      INSERT INTO accounts (id, name, type)
      SELECT v.id, v.name, v.type
      FROM unnest(
        ${input.extraAccountIds}::uuid[],
        ${input.extraAccountNames}::text[],
        ${input.extraAccountTypes}::text[]
      ) AS v(id, name, type)
      WHERE NOT EXISTS (SELECT 1 FROM accounts existing WHERE existing.name = v.name)
    `);
  }

  if (input.instruments.length > 0) {
    queries.push(sql`
      INSERT INTO instruments (id, symbol, name, asset_class, currency, unit_basis)
      SELECT v.id, v.symbol, v.name, v.asset_class, v.currency, v.unit_basis
      FROM unnest(
        ${input.instruments.map(i => i.id)}::uuid[],
        ${input.instruments.map(i => i.symbol)}::text[],
        ${input.instruments.map(i => i.name)}::text[],
        ${input.instruments.map(i => i.assetClass)}::text[],
        ${input.instruments.map(i => i.currency)}::text[],
        ${input.instruments.map(i => i.unitBasis)}::numeric[]
      ) AS v(id, symbol, name, asset_class, currency, unit_basis)
      ON CONFLICT (symbol, currency) DO NOTHING
    `);
  }

  if (input.positions.length > 0) {
    queries.push(sql`
      INSERT INTO positions (id, snapshot_id, account_id, instrument_id, quantity, avg_cost, price, fx_rate_to_jpy)
      SELECT
        v.id,
        ${input.snapshotId}::uuid,
        COALESCE(v.account_id, a.id),
        i.id,
        v.quantity,
        v.avg_cost,
        v.price,
        v.fx_rate_to_jpy
      FROM unnest(
        ${input.positions.map(p => p.id)}::uuid[],
        ${input.positions.map(p => p.accountId)}::uuid[],
        ${input.positions.map(p => p.accountName)}::text[],
        ${input.positions.map(p => p.symbol)}::text[],
        ${input.positions.map(p => p.currency)}::text[],
        ${input.positions.map(p => p.quantity)}::numeric[],
        ${input.positions.map(p => p.avgCost)}::numeric[],
        ${input.positions.map(p => p.price)}::numeric[],
        ${input.positions.map(p => p.fxRateToJpy)}::numeric[]
      ) AS v(id, account_id, account_name, symbol, currency, quantity, avg_cost, price, fx_rate_to_jpy)
      LEFT JOIN accounts a ON a.name = v.account_name
      JOIN instruments i ON i.symbol = v.symbol AND i.currency = v.currency
    `);
  }

  if (input.cashBalances.length > 0) {
    queries.push(sql`
      INSERT INTO cash_balances (id, snapshot_id, account_id, currency, amount, fx_rate_to_jpy)
      SELECT
        v.id,
        ${input.snapshotId}::uuid,
        COALESCE(v.account_id, a.id),
        v.currency,
        v.amount,
        v.fx_rate_to_jpy
      FROM unnest(
        ${input.cashBalances.map(c => c.id)}::uuid[],
        ${input.cashBalances.map(c => c.accountId)}::uuid[],
        ${input.cashBalances.map(c => c.accountName)}::text[],
        ${input.cashBalances.map(c => c.currency)}::text[],
        ${input.cashBalances.map(c => c.amount)}::numeric[],
        ${input.cashBalances.map(c => c.fxRateToJpy)}::numeric[]
      ) AS v(id, account_id, account_name, currency, amount, fx_rate_to_jpy)
      LEFT JOIN accounts a ON a.name = v.account_name
    `);
  }

  if (input.cashFlows.length > 0) {
    queries.push(sql`
      INSERT INTO cash_flows (id, account_id, date, direction, amount_jpy, note, source, batch_id)
      SELECT
        v.id,
        a.id,
        v.date,
        v.direction,
        v.amount_jpy,
        v.note,
        'screenshot',
        ${input.batchId}::uuid
      FROM unnest(
        ${input.cashFlows.map(f => f.id)}::uuid[],
        ${input.cashFlows.map(f => f.accountName)}::text[],
        ${input.cashFlows.map(f => f.date)}::date[],
        ${input.cashFlows.map(f => f.direction)}::text[],
        ${input.cashFlows.map(f => f.amountJpy)}::numeric[],
        ${input.cashFlows.map(f => f.note)}::text[]
      ) AS v(id, account_name, date, direction, amount_jpy, note)
      LEFT JOIN accounts a ON a.name = v.account_name
    `);
  }

  if (input.snapshotAccountIds.length > 0 || input.snapshotAccountNames.length > 0) {
    queries.push(sql`
      INSERT INTO snapshot_accounts (snapshot_id, account_id)
      SELECT ${input.snapshotId}::uuid, a.id
      FROM accounts a
      WHERE a.id = ANY(${input.snapshotAccountIds}::uuid[])
         OR a.name = ANY(${input.snapshotAccountNames}::text[])
      ON CONFLICT DO NOTHING
    `);
  }

  queries.push(sql`
    SELECT CASE
      WHEN COUNT(*) = ${input.positions.length} THEN 1
      ELSE 1 / 0
    END AS ok
    FROM positions
    WHERE snapshot_id = ${input.snapshotId}::uuid
  `);

  return queries;
}

export async function commitIngest(input: {
  idempotencyKey: string;
  asOf: string;
  accounts?: IngestAccountInput[];
  positions?: IngestPositionInput[];
  cashBalances?: IngestCashBalanceInput[];
  cashFlows?: IngestCashFlowInput[];
}): Promise<{ batchId: string; positionsInserted: number; cashFlowsInserted: number }> {
  const batchId = randomUUID();
  const snapshotId = randomUUID();
  const accountMap = new Map<string, string>();
  const providedAccounts: Array<{ id: string; name: string; type: IngestAccountInput['type']; broker: string | null }> = [];

  for (const acc of input.accounts ?? []) {
    const id = randomUUID();
    accountMap.set(acc.name, id);
    providedAccounts.push({
      id,
      name: acc.name,
      type: acc.type,
      broker: acc.broker ?? null,
    });
  }

  const extraAccounts: Array<{ id: string; name: string; type: 'other' | 'cash' }> = [];

  function extraAccount(name: string, type: 'other' | 'cash'): string | null {
    const existing = accountMap.get(name);
    if (existing) return existing;
    if (extraAccounts.some(a => a.name === name)) {
      return extraAccounts.find(a => a.name === name)!.id;
    }
    const id = randomUUID();
    extraAccounts.push({ id, name, type });
    return null;
  }

  const instrumentsByKey = new Map<string, {
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    currency: string;
    unitBasis: string;
  }>();

  const positions = (input.positions ?? []).map(pos => {
    const mappedId = accountMap.get(pos.accountName) ?? null;
    if (!mappedId) extraAccount(pos.accountName, 'other');
    const key = `${pos.symbol}\0${pos.currency}`;
    if (!instrumentsByKey.has(key)) {
      instrumentsByKey.set(key, {
        id: randomUUID(),
        symbol: pos.symbol,
        name: pos.name,
        assetClass: pos.assetClass,
        currency: pos.currency,
        unitBasis: pos.unitBasis || (pos.assetClass === 'fund' ? '10000' : '1'),
      });
    }
    return {
      id: randomUUID(),
      accountId: mappedId,
      accountName: pos.accountName,
      symbol: pos.symbol,
      currency: pos.currency,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      price: pos.price,
      fxRateToJpy: fxRateForPosition(pos.currency, pos.fxRateToJpy),
    };
  });

  const cashBalances = (input.cashBalances ?? []).map(cash => {
    const mappedId = accountMap.get(cash.accountName) ?? null;
    if (!mappedId) extraAccount(cash.accountName, 'cash');
    return {
      id: randomUUID(),
      accountId: mappedId,
      accountName: cash.accountName,
      currency: cash.currency,
      amount: cash.amount,
      fxRateToJpy: fxRateForCash(cash.currency, cash.fxRateToJpy),
    };
  });

  const cashFlows = (input.cashFlows ?? []).map(flow => ({
    id: randomUUID(),
    accountName: flow.accountName ?? null,
    date: flow.date,
    direction: flow.direction,
    amountJpy: flow.amountJpy,
    note: flow.note ?? null,
  }));

  const snapshotAccountIds = [...accountMap.values()];
  const snapshotAccountNames = extraAccounts.map(a => a.name);

  try {
    await httpTransaction(sql => buildIngestQueries(sql, {
      batchId,
      snapshotId,
      idempotencyKey: input.idempotencyKey,
      asOf: input.asOf,
      providedAccounts,
      extraAccountNames: extraAccounts.map(a => a.name),
      extraAccountTypes: extraAccounts.map(a => a.type),
      extraAccountIds: extraAccounts.map(a => a.id),
      instruments: [...instrumentsByKey.values()],
      positions,
      cashBalances,
      cashFlows,
      snapshotAccountIds,
      snapshotAccountNames,
      rowCount: positions.length + cashFlows.length,
    }));
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new IdempotentConflictError();
    }
    throw error;
  }

  return {
    batchId,
    positionsInserted: positions.length,
    cashFlowsInserted: cashFlows.length,
  };
}

export function buildRevertQueries(sql: TxSql, batchId: string): NeonQueryInTransaction[] {
  return [
    sql`SELECT id, status FROM import_batches WHERE id = ${batchId}::uuid`,
    sql`DELETE FROM snapshots WHERE batch_id = ${batchId}::uuid AND EXISTS (
      SELECT 1 FROM import_batches WHERE id = ${batchId}::uuid AND status = 'committed'
    )`,
    sql`DELETE FROM cash_flows WHERE batch_id = ${batchId}::uuid AND EXISTS (
      SELECT 1 FROM import_batches WHERE id = ${batchId}::uuid AND status = 'committed'
    )`,
    sql`UPDATE import_batches SET status = 'reverted' WHERE id = ${batchId}::uuid AND status = 'committed'`,
  ];
}

export type RevertOutcome = 'ok' | 'not_found' | 'already_reverted';

export function interpretRevertResults(batchRow: { status?: string } | undefined): RevertOutcome {
  if (!batchRow) return 'not_found';
  if (batchRow.status === 'reverted') return 'already_reverted';
  return 'ok';
}

export async function revertImportBatch(batchId: string): Promise<RevertOutcome> {
  const results = await httpTransaction(sql => buildRevertQueries(sql, batchId));
  const batchRow = results[0]?.rows[0] as { status?: string } | undefined;
  return interpretRevertResults(batchRow);
}

export function buildFxUpdateQueries(
  sql: TxSql,
  snapshotId: string,
  currency: string,
  rateToJpy: string,
): NeonQueryInTransaction[] {
  return [
    sql`
      UPDATE positions AS p
      SET fx_rate_to_jpy = ${rateToJpy}
      FROM instruments i
      WHERE p.instrument_id = i.id
        AND p.snapshot_id = ${snapshotId}::uuid
        AND i.currency = ${currency}
    `,
    sql`
      UPDATE cash_balances
      SET fx_rate_to_jpy = ${rateToJpy}
      WHERE snapshot_id = ${snapshotId}::uuid
        AND currency = ${currency}
    `,
  ];
}

export function updatedRowCount(result: FullQueryResults<false> | undefined): number {
  return result?.rowCount ?? 0;
}

export async function updateSnapshotFxRate(
  snapshotId: string,
  currency: string,
  rateToJpy: string,
): Promise<{ updatedCount: number }> {
  const results = await httpTransaction(sql => buildFxUpdateQueries(sql, snapshotId, currency, rateToJpy));
  return {
    updatedCount: updatedRowCount(results[0]) + updatedRowCount(results[1]),
  };
}

export function buildMoveQueries(
  sql: TxSql,
  positionId: string,
  accountId: string,
): NeonQueryInTransaction[] {
  return [
    sql`
      SELECT id, snapshot_id, account_id, instrument_id
      FROM positions
      WHERE id = ${positionId}::uuid
    `,
    sql`SELECT id FROM accounts WHERE id = ${accountId}::uuid`,
    sql`
      SELECT snapshot_id, account_id
      FROM snapshot_accounts
      WHERE snapshot_id = (SELECT snapshot_id FROM positions WHERE id = ${positionId}::uuid)
        AND account_id = ${accountId}::uuid
    `,
    sql`
      SELECT p.id
      FROM positions p
      WHERE p.snapshot_id = (SELECT snapshot_id FROM positions WHERE id = ${positionId}::uuid)
        AND p.account_id = ${accountId}::uuid
        AND p.instrument_id = (SELECT instrument_id FROM positions WHERE id = ${positionId}::uuid)
        AND p.id <> ${positionId}::uuid
    `,
    sql`
      UPDATE positions
      SET account_id = ${accountId}::uuid
      WHERE id = ${positionId}::uuid
        AND (
          account_id = ${accountId}::uuid
          OR (
            EXISTS (
              SELECT 1 FROM snapshot_accounts sa
              WHERE sa.snapshot_id = positions.snapshot_id
                AND sa.account_id = ${accountId}::uuid
            )
            AND NOT EXISTS (
              SELECT 1 FROM positions p2
              WHERE p2.snapshot_id = positions.snapshot_id
                AND p2.account_id = ${accountId}::uuid
                AND p2.instrument_id = positions.instrument_id
                AND p2.id <> positions.id
            )
          )
        )
    `,
  ];
}

export type MoveWriteSnapshot = {
  position?: { snapshot_id: string; account_id: string };
  targetAccountExists: boolean;
  targetInSnapshot: boolean;
  sameInstrument: boolean;
  updatedRowCount: number;
  targetAccountId: string;
};

export function interpretMoveWrite(snapshot: MoveWriteSnapshot): MovePositionOk | MovePositionFail {
  if (!snapshot.position) {
    return { ok: false, status: 404, error: '持仓不存在' };
  }
  if (snapshot.position.account_id === snapshot.targetAccountId) {
    return {
      ok: true,
      snapshotId: snapshot.position.snapshot_id,
      fromAccountId: snapshot.position.account_id,
      toAccountId: snapshot.targetAccountId,
    };
  }
  if (!snapshot.targetAccountExists) {
    return { ok: false, status: 400, error: '账户不存在' };
  }
  if (!snapshot.targetInSnapshot) {
    return { ok: false, status: 409, error: MOVE_NOT_IN_SNAPSHOT_ERROR };
  }
  if (snapshot.sameInstrument) {
    return { ok: false, status: 409, error: MOVE_DUPLICATE_INSTRUMENT_ERROR };
  }
  if (snapshot.updatedRowCount === 1) {
    return {
      ok: true,
      snapshotId: snapshot.position.snapshot_id,
      fromAccountId: snapshot.position.account_id,
      toAccountId: snapshot.targetAccountId,
    };
  }
  return { ok: false, status: 409, error: MOVE_DUPLICATE_INSTRUMENT_ERROR };
}

export async function movePositionHttp(
  positionId: string,
  accountId: string,
): Promise<MovePositionOk | MovePositionFail> {
  try {
    const results = await httpTransaction(sql => buildMoveQueries(sql, positionId, accountId));
    const position = results[0]?.rows[0] as { snapshot_id: string; account_id: string } | undefined;
    return interpretMoveWrite({
      position,
      targetAccountExists: updatedRowCount(results[1]) > 0,
      targetInSnapshot: updatedRowCount(results[2]) > 0,
      sameInstrument: updatedRowCount(results[3]) > 0,
      updatedRowCount: updatedRowCount(results[4]),
      targetAccountId: accountId,
    });
  } catch (error) {
    if (isUniqueConstraintError(error) || isPgUniqueViolation(error)) {
      return { ok: false, status: 409, error: MOVE_DUPLICATE_INSTRUMENT_ERROR };
    }
    throw error;
  }
}

export type ManualAccountType = 'tokutei' | 'nisa_growth' | 'nisa_tsumitate' | 'other';

export function buildManualPositionsQueries(
  sql: TxSql,
  plan: {
    snapshotId: string;
    accountId: string;
    accountName: string;
    accountType: ManualAccountType;
    asOf: string;
    instruments: Array<{
      id: string;
      symbol: string;
      name: string;
      assetClass: string;
      currency: string;
      unitBasis: string;
    }>;
    positions: Array<{
      id: string;
      symbol: string;
      currency: string;
      quantity: string;
      avgCost: string;
      price: string;
      fxRateToJpy: string | null;
    }>;
  },
): NeonQueryInTransaction[] {
  const queries: NeonQueryInTransaction[] = [
    sql`
      INSERT INTO accounts (id, name, type)
      SELECT ${plan.accountId}::uuid, ${plan.accountName}, ${plan.accountType}
      WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = ${plan.accountName})
    `,
    sql`
      INSERT INTO snapshots (id, as_of, source)
      VALUES (${plan.snapshotId}::uuid, ${plan.asOf}, 'manual')
    `,
  ];

  if (plan.instruments.length > 0) {
    queries.push(sql`
      INSERT INTO instruments (id, symbol, name, asset_class, currency, unit_basis)
      SELECT v.id, v.symbol, v.name, v.asset_class, v.currency, v.unit_basis
      FROM unnest(
        ${plan.instruments.map(i => i.id)}::uuid[],
        ${plan.instruments.map(i => i.symbol)}::text[],
        ${plan.instruments.map(i => i.name)}::text[],
        ${plan.instruments.map(i => i.assetClass)}::text[],
        ${plan.instruments.map(i => i.currency)}::text[],
        ${plan.instruments.map(i => i.unitBasis)}::numeric[]
      ) AS v(id, symbol, name, asset_class, currency, unit_basis)
      ON CONFLICT (symbol, currency) DO NOTHING
    `);
  }

  if (plan.positions.length > 0) {
    queries.push(sql`
      INSERT INTO positions (id, snapshot_id, account_id, instrument_id, quantity, avg_cost, price, fx_rate_to_jpy)
      SELECT
        v.id,
        ${plan.snapshotId}::uuid,
        a.id,
        i.id,
        v.quantity,
        v.avg_cost,
        v.price,
        v.fx_rate_to_jpy
      FROM unnest(
        ${plan.positions.map(p => p.id)}::uuid[],
        ${plan.positions.map(p => p.symbol)}::text[],
        ${plan.positions.map(p => p.currency)}::text[],
        ${plan.positions.map(p => p.quantity)}::numeric[],
        ${plan.positions.map(p => p.avgCost)}::numeric[],
        ${plan.positions.map(p => p.price)}::numeric[],
        ${plan.positions.map(p => p.fxRateToJpy)}::numeric[]
      ) AS v(id, symbol, currency, quantity, avg_cost, price, fx_rate_to_jpy)
      JOIN accounts a ON a.name = ${plan.accountName}
      JOIN instruments i ON i.symbol = v.symbol AND i.currency = v.currency
    `);
  }

  queries.push(
    sql`
      INSERT INTO snapshot_accounts (snapshot_id, account_id)
      SELECT ${plan.snapshotId}::uuid, a.id
      FROM accounts a
      WHERE a.name = ${plan.accountName}
      ON CONFLICT DO NOTHING
    `,
    sql`
      SELECT CASE
        WHEN COUNT(*) = ${plan.positions.length} THEN 1
        ELSE 1 / 0
      END AS ok
      FROM positions
      WHERE snapshot_id = ${plan.snapshotId}::uuid
    `,
  );

  return queries;
}

export async function createManualPositions(input: {
  asOf: string;
  accountName: string;
  accountType?: ManualAccountType;
  positions: Array<{
    symbol: string;
    name: string;
    assetClass?: string;
    currency?: string;
    quantity: string;
    avgCost: string;
    price: string;
    fxRateToJpy?: string;
    unitBasis?: string;
  }>;
}): Promise<{ snapshotId: string; created: number }> {
  const snapshotId = randomUUID();
  const accountId = randomUUID();
  const accountType = input.accountType ?? 'tokutei';
  const instrumentsByKey = new Map<string, {
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    currency: string;
    unitBasis: string;
  }>();

  const positions = input.positions.map(pos => {
    const currency = pos.currency || 'JPY';
    const key = `${pos.symbol}\0${currency}`;
    if (!instrumentsByKey.has(key)) {
      instrumentsByKey.set(key, {
        id: randomUUID(),
        symbol: pos.symbol,
        name: pos.name,
        assetClass: pos.assetClass || 'other',
        currency,
        unitBasis: pos.unitBasis || '1',
      });
    }
    return {
      id: randomUUID(),
      symbol: pos.symbol,
      currency,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      price: pos.price,
      fxRateToJpy: pos.fxRateToJpy || (currency === 'JPY' ? '1' : null),
    };
  });

  await httpTransaction(sql => buildManualPositionsQueries(sql, {
    snapshotId,
    accountId,
    accountName: input.accountName,
    accountType,
    asOf: input.asOf,
    instruments: [...instrumentsByKey.values()],
    positions,
  }));

  return { snapshotId, created: input.positions.length };
}
