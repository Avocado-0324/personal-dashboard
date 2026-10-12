import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { importBatches } from '@/db/schema';
import { decodeShiftJIS, parseSBIHoldings, computeIdempotencyKey } from '@/modules/portfolio/import/sbi';
import { and, eq, sql } from 'drizzle-orm';
import { logWriteError } from '@/lib/write-error-log';
import {
  IdempotentConflictError,
  commitCsvImport,
  formatImportTimeZh,
} from '@/modules/portfolio/http-writes';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * SBI CSV 导入 API
 * 
 * 导入语义：
 * - 只写入/覆盖本次解析出的账户（由 accountSummaries 的账户集合决定，含 0 条持仓的空段）
 * - 文件中未出现的账户不受影响，保持原有持仓不变
 */

const CSV_ROUTE = '/api/portfolio/import/csv';

function alreadyImportedResponse(batch: { id: string; rowCount: number | null; createdAt: Date | null }) {
  const timeStr = formatImportTimeZh(batch.createdAt);
  return NextResponse.json(
    {
      imported: batch.rowCount || 0,
      errors: [],
      skipped: 0,
      message: `这个文件已经导入过（${timeStr}），没有重复写入`,
      batchId: batch.id,
      alreadyImported: true,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

async function findCommittedBatch(idempotencyKey: string) {
  const db = getDb();
  return db
    .select()
    .from(importBatches)
    .where(and(
      eq(importBatches.idempotencyKey, idempotencyKey),
      sql`${importBatches.status} <> 'reverted'`
    ))
    .limit(1);
}

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      logWriteError(CSV_ROUTE, 'write', new Error('DATABASE_URL not configured'));
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let dryRun: boolean;
    let formData: FormData;
    try {
      dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
      formData = await request.formData();
    } catch (error) {
      logWriteError(CSV_ROUTE, 'parse', error);
      return NextResponse.json(
        { error: '导入失败' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const file = formData.get('file') as File | null;
    const asOf = formData.get('asOf') as string;

    if (!file) {
      return NextResponse.json(
        { error: '未指定文件' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小超过 1MB' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!asOf) {
      return NextResponse.json(
        { error: '需要 asOf 日期' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let fileBuffer: Buffer;
    let csvText: string;
    let idempotencyKey: string;
    let parsedPositions: ReturnType<typeof parseSBIHoldings>['positions'];
    let errors: ReturnType<typeof parseSBIHoldings>['errors'];
    let accountSummaries: ReturnType<typeof parseSBIHoldings>['accountSummaries'];
    try {
      const buffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(buffer);
      csvText = decodeShiftJIS(buffer);
      idempotencyKey = computeIdempotencyKey(fileBuffer, asOf);
      ({ positions: parsedPositions, errors, accountSummaries } = parseSBIHoldings(csvText));
    } catch (error) {
      logWriteError(CSV_ROUTE, 'parse', error);
      return NextResponse.json(
        { error: '导入失败' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (dryRun) {
      return NextResponse.json(
        {
          accountSummaries: accountSummaries.map(s => ({
            accountName: s.accountName,
            accountType: s.accountType,
            count: s.count,
            totalValueJpy: s.totalValueJpy,
            matchesFile: s.matchesFile,
          })),
          errors,
          totalRows: parsedPositions.length,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { errors, imported: 0 },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let existingBatches: Array<typeof importBatches.$inferSelect>;
    try {
      existingBatches = await findCommittedBatch(idempotencyKey);
    } catch (error) {
      logWriteError(CSV_ROUTE, 'write', error);
      return NextResponse.json(
        { error: '导入失败' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (existingBatches.length > 0 && existingBatches[0].status === 'committed') {
      return alreadyImportedResponse(existingBatches[0]);
    }

    try {
      const { batchId } = await commitCsvImport({
        asOf,
        filename: file.name,
        idempotencyKey,
        accountSummaries,
        positions: parsedPositions,
      });

      return NextResponse.json(
        {
          imported: parsedPositions.length,
          errors: [],
          skipped: 0,
          batchId,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (txError) {
      if (txError instanceof IdempotentConflictError || (txError && typeof txError === 'object' && (txError as { name?: string }).name === 'IdempotentConflictError')) {
        const raced = await findCommittedBatch(idempotencyKey);
        if (raced.length > 0) {
          return alreadyImportedResponse(raced[0]);
        }
      }

      logWriteError(CSV_ROUTE, 'write', txError);
      return NextResponse.json(
        {
          imported: 0,
          errors: [{ row: 0, message: '事务失败' }],
        },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  } catch (error) {
    logWriteError(CSV_ROUTE, 'other', error);
    return NextResponse.json(
      { error: '导入失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
