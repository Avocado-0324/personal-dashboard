import { pgTable, uuid, text, date, numeric, integer, timestamp, char, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull().$type<'csv' | 'screenshot'>(),
  idempotencyKey: text('idempotency_key').notNull(),
  filename: text('filename'),
  rowCount: integer('row_count'),
  status: text('status').notNull().default('committed').$type<'committed' | 'reverted'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceCheck: check('source_check', sql`${table.source} IN ('csv', 'screenshot')`),
  statusCheck: check('status_check', sql`${table.status} IN ('committed', 'reverted')`),
  idempotencyKeyUniqueNotReverted: uniqueIndex('import_batches_idempotency_key_unique_not_reverted')
    .on(table.idempotencyKey)
    .where(sql`${table.status} <> 'reverted'`),
  idempotencyKeyIdx: index('import_batches_idempotency_idx').on(table.idempotencyKey),
}));

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'tokutei' | 'nisa_growth' | 'nisa_tsumitate' | 'cash' | 'other'>(),
  broker: text('broker'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  typeCheck: check('type_check', sql`${table.type} IN ('tokutei', 'nisa_growth', 'nisa_tsumitate', 'cash', 'other')`),
}));

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  assetClass: text('asset_class').notNull().$type<'jp_stock' | 'us_stock' | 'fund' | 'etf' | 'bond' | 'reit' | 'crypto' | 'other'>(),
  currency: char('currency', { length: 3 }).notNull(),
  unitBasis: numeric('unit_basis', { precision: 10, scale: 2 }).notNull().default('1'),
}, (table) => ({
  assetClassCheck: check('asset_class_check', sql`${table.assetClass} IN ('jp_stock', 'us_stock', 'fund', 'etf', 'bond', 'reit', 'crypto', 'other')`),
  symbolCurrencyUnique: uniqueIndex('instruments_symbol_currency_unique').on(table.symbol, table.currency),
}));

export const snapshots = pgTable('snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  asOf: date('as_of').notNull(),
  source: text('source').notNull().$type<'manual' | 'csv' | 'screenshot'>(),
  batchId: uuid('batch_id').references(() => importBatches.id),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceCheck: check('source_check', sql`${table.source} IN ('manual', 'csv', 'screenshot')`),
  asOfIdx: index('snapshots_as_of_idx').on(sql`${table.asOf} DESC`),
}));

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshots.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  instrumentId: uuid('instrument_id').notNull().references(() => instruments.id),
  quantity: numeric('quantity', { precision: 24, scale: 8 }).notNull(),
  avgCost: numeric('avg_cost', { precision: 24, scale: 8 }).notNull(),
  price: numeric('price', { precision: 24, scale: 8 }).notNull(),
  fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 14, scale: 6 }),
}, (table) => ({
  snapshotAccountInstrumentUnique: uniqueIndex('positions_snapshot_account_instrument_unique')
    .on(table.snapshotId, table.accountId, table.instrumentId),
  snapshotIdx: index('positions_snapshot_idx').on(table.snapshotId),
}));

export const cashBalances = pgTable('cash_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshots.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  currency: char('currency', { length: 3 }).notNull(),
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 14, scale: 6 }),
}, (table) => ({
  snapshotIdx: index('cash_balances_snapshot_idx').on(table.snapshotId),
}));

export const cashFlows = pgTable('cash_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => accounts.id),
  date: date('date').notNull(),
  direction: text('direction').notNull().$type<'deposit' | 'withdrawal'>(),
  amountJpy: numeric('amount_jpy', { precision: 20, scale: 2 }).notNull(),
  note: text('note'),
  source: text('source').notNull().$type<'manual' | 'csv' | 'screenshot'>(),
  batchId: uuid('batch_id').references(() => importBatches.id),
}, (table) => ({
  directionCheck: check('direction_check', sql`${table.direction} IN ('deposit', 'withdrawal')`),
  sourceCheck: check('source_check', sql`${table.source} IN ('manual', 'csv', 'screenshot')`),
  amountCheck: check('amount_check', sql`${table.amountJpy} > 0`),
  dateIdx: index('cash_flows_date_idx').on(table.date),
}));
