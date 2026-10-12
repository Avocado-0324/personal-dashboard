import { describe, expect, it } from '@jest/globals';
import {
  planCsvImport,
  buildCsvImportQueries,
  buildRevertQueries,
  buildMoveQueries,
  buildFxUpdateQueries,
  interpretMoveWrite,
  interpretRevertResults,
  IdempotentConflictError,
} from '../http-writes';
import { MOVE_DUPLICATE_INSTRUMENT_ERROR, MOVE_NOT_IN_SNAPSHOT_ERROR } from '../move-position';
import { isPgUniqueViolation } from '@/db/utils';

type CapturedQuery = { text: string; values: unknown[] };

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): CapturedQuery {
  const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '');
  return { text, values };
}

function queryTexts(queries: unknown[]): string[] {
  return queries.map(q => (q as CapturedQuery).text.replace(/\s+/g, ' ').trim());
}

describe('planCsvImport', () => {
  it('在应用层生成 snapshot_id / batch_id / 行 id', () => {
    const plan = planCsvImport({
      asOf: '2026-10-12',
      filename: 'holdings.csv',
      idempotencyKey: 'abc',
      accountSummaries: [
        { accountName: 'SBI 特定', accountType: 'tokutei' },
        { accountName: 'SBI NISAつみたて', accountType: 'nisa_tsumitate' },
      ],
      positions: [
        {
          accountName: 'SBI 特定',
          symbol: '7203',
          name: 'トヨタ自動車',
          assetClass: 'jp_stock',
          quantity: '100',
          avgCost: '2000',
          price: '2100',
          unitBasis: '1',
        },
      ],
    });

    expect(plan.batchId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(plan.snapshotId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(plan.accounts).toHaveLength(2);
    expect(plan.accounts[1].name).toBe('SBI NISAつみたて');
    expect(plan.positions[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(plan.instruments[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('buildCsvImportQueries', () => {
  it('用 ON CONFLICT / WHERE NOT EXISTS，不先查再写', () => {
    const plan = planCsvImport({
      asOf: '2026-10-12',
      filename: 'holdings.csv',
      idempotencyKey: 'key-1',
      accountSummaries: [{ accountName: 'SBI 特定', accountType: 'tokutei' }],
      positions: [{
        accountName: 'SBI 特定',
        symbol: '7203',
        name: 'トヨタ自動車',
        assetClass: 'jp_stock',
        quantity: '10',
        avgCost: '1',
        price: '2',
        unitBasis: '1',
      }],
    });

    const texts = queryTexts(buildCsvImportQueries(fakeSql as never, plan));
    const joined = texts.join('\n');
    expect(joined).toMatch(/ON CONFLICT \(symbol, currency\) DO NOTHING/i);
    expect(joined).toMatch(/WHERE NOT EXISTS/i);
    expect(joined).toMatch(/INSERT INTO import_batches/i);
    expect(joined).toMatch(/INSERT INTO snapshot_accounts/i);
    expect(joined).toMatch(/unnest\(/i);
  });

  it('0 条持仓的账户仍写入 snapshot_accounts', () => {
    const plan = planCsvImport({
      asOf: '2026-10-12',
      filename: 'empty.csv',
      idempotencyKey: 'key-empty',
      accountSummaries: [{ accountName: 'SBI 特定', accountType: 'tokutei' }],
      positions: [],
    });

    const texts = queryTexts(buildCsvImportQueries(fakeSql as never, plan));
    expect(texts.some(t => /INSERT INTO snapshot_accounts/i.test(t))).toBe(true);
    expect(texts.some(t => /INSERT INTO positions/i.test(t))).toBe(false);
  });
});

describe('buildRevertQueries', () => {
  it('用条件 DELETE/UPDATE，不依赖交互式先查再写', () => {
    const texts = queryTexts(buildRevertQueries(fakeSql as never, '11111111-1111-4111-8111-111111111111'));
    expect(texts[0]).toMatch(/SELECT id, status FROM import_batches/i);
    expect(texts.some(t => /DELETE FROM snapshots/i.test(t) && /status = 'committed'/i.test(t))).toBe(true);
    expect(texts.some(t => /UPDATE import_batches SET status = 'reverted'/i.test(t))).toBe(true);
  });
});

describe('buildMoveQueries / interpretMoveWrite', () => {
  it('条件 UPDATE 要求同快照且无同标的', () => {
    const texts = queryTexts(buildMoveQueries(
      fakeSql as never,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ));
    const update = texts.find(t => t.startsWith('UPDATE positions')) || '';
    expect(update).toMatch(/snapshot_accounts/i);
    expect(update).toMatch(/NOT EXISTS/i);
  });

  it('跨快照返回 409', () => {
    const result = interpretMoveWrite({
      position: { snapshot_id: 'snap-a', account_id: 'acct-a' },
      targetAccountExists: true,
      targetInSnapshot: false,
      sameInstrument: false,
      updatedRowCount: 0,
      targetAccountId: 'acct-b',
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: MOVE_NOT_IN_SNAPSHOT_ERROR,
    });
  });

  it('同标的返回 409', () => {
    const result = interpretMoveWrite({
      position: { snapshot_id: 'snap-a', account_id: 'acct-a' },
      targetAccountExists: true,
      targetInSnapshot: true,
      sameInstrument: true,
      updatedRowCount: 0,
      targetAccountId: 'acct-b',
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: MOVE_DUPLICATE_INSTRUMENT_ERROR,
    });
  });

  it('并发 23505 按错误码转 409，不比对约束名', () => {
    expect(isPgUniqueViolation({
      code: '23505',
      constraint: 'positions_snapshot_id_account_id_instrument_id_key',
    })).toBe(true);
    expect(new IdempotentConflictError().name).toBe('IdempotentConflictError');
  });
});

describe('interpretRevertResults', () => {
  it('不存在 / 已撤销 / 可撤销', () => {
    expect(interpretRevertResults(undefined)).toBe('not_found');
    expect(interpretRevertResults({ status: 'reverted' })).toBe('already_reverted');
    expect(interpretRevertResults({ status: 'committed' })).toBe('ok');
  });
});

describe('buildFxUpdateQueries', () => {
  it('按快照+币种批量更新，不逐行先查', () => {
    const texts = queryTexts(buildFxUpdateQueries(
      fakeSql as never,
      '11111111-1111-4111-8111-111111111111',
      'USD',
      '150.25',
    ));
    expect(texts[0]).toMatch(/UPDATE positions/i);
    expect(texts[1]).toMatch(/UPDATE cash_balances/i);
  });
});
