import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions, cashBalances, importBatches } from '@/db/schema';
import { decodeShiftJIS, parseSBIPositions, type CSVError } from '@/modules/portfolio/import/sbi';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') === '1';

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const asOf = formData.get('asOf') as string;
    const accountName = formData.get('accountName') as string;

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

    if (!asOf || !accountName) {
      return NextResponse.json(
        { error: '需要 asOf 和 accountName' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Shift_JIS 解码
    const buffer = await file.arrayBuffer();
    const csvText = decodeShiftJIS(buffer);

    // 解析
    const { positions: parsedPositions, errors } = parseSBIPositions(csvText);

    if (dryRun) {
      // dry-run：仅预览
      return NextResponse.json(
        {
          preview: parsedPositions.map((p, i) => ({
            row: i + 2, // 表头之后
            symbol: p.symbol,
            name: p.name,
            quantity: p.quantity,
            price: p.price,
            currency: p.currency,
          })),
          errors,
          totalRows: parsedPositions.length,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 有错误则中断
    if (errors.length > 0) {
      return NextResponse.json(
        { errors, imported: 0 },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 写入（事务）
    const db = getDb();

    try {
      // 事务开始
      await db.transaction(async (tx) => {
        // 获取或创建账户
        const accountRecords = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.name, accountName))
          .limit(1);

        let accountId: string;
        if (accountRecords.length === 0) {
          const [newAccount] = await tx
            .insert(accounts)
            .values({
              name: accountName,
              type: 'tokutei',
            })
            .returning();
          accountId = newAccount.id;
        } else {
          accountId = accountRecords[0].id;
        }

        // 创建批次
        const [batch] = await tx
          .insert(importBatches)
          .values({
            source: 'csv',
            idempotencyKey: `csv-${Date.now()}-${Math.random()}`,
            filename: file.name,
            rowCount: parsedPositions.length,
            status: 'committed',
          })
          .returning();

        // 创建快照
        const [snapshot] = await tx
          .insert(snapshots)
          .values({
            asOf,
            source: 'csv',
            batchId: batch.id,
          })
          .returning();

        // 写入各持仓
        for (const pos of parsedPositions) {
          // 获取或创建 Instrument
          let instrumentRecords = await tx
            .select()
            .from(instruments)
            .where(eq(instruments.symbol, pos.symbol))
            .limit(1);

          let instrumentId: string;
          if (instrumentRecords.length === 0) {
            const [newInstrument] = await tx
              .insert(instruments)
              .values({
                symbol: pos.symbol,
                name: pos.name,
                assetClass: 'jp_stock',
                currency: pos.currency,
                unitBasis: '1',
              })
              .returning();
            instrumentId = newInstrument.id;
          } else {
            instrumentId = instrumentRecords[0].id;
          }

          // Position 作成
          await tx.insert(positions).values({
            snapshotId: snapshot.id,
            accountId,
            instrumentId,
            quantity: pos.quantity,
            avgCost: pos.avgCost,
            price: pos.price,
            fxRateToJpy: pos.currency === 'JPY' ? '1' : null,
          });
        }
      });

      return NextResponse.json(
        {
          imported: parsedPositions.length,
          errors: [],
          skipped: 0,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (txError) {
      // 事务失败
      console.error('Transaction failed:', txError);
      return NextResponse.json(
        {
          imported: 0,
          errors: [{ row: 0, message: '事务失败' }],
        },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: '导入失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
