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
        { error: 'データベース未配置' },
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
        { error: 'ファイルが指定されていません' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'ファイルサイズが 1MB を超えています' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!asOf || !accountName) {
      return NextResponse.json(
        { error: 'asOf と accountName が必要です' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Shift_JIS デコード
    const buffer = await file.arrayBuffer();
    const csvText = decodeShiftJIS(buffer);

    // パース
    const { positions: parsedPositions, errors } = parseSBIPositions(csvText);

    if (dryRun) {
      // dry-run：プレビューのみ
      return NextResponse.json(
        {
          preview: parsedPositions.map((p, i) => ({
            row: i + 2, // ヘッダーの次から
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

    // エラーがあれば中断
    if (errors.length > 0) {
      return NextResponse.json(
        { errors, imported: 0 },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 書き込み（トランザクション）
    const db = getDb();

    // アカウント取得または作成
    let accountRecords = await db
      .select()
      .from(accounts)
      .where(eq(accounts.name, accountName))
      .limit(1);

    let accountId: string;
    if (accountRecords.length === 0) {
      const [newAccount] = await db
        .insert(accounts)
        .values({
          name: accountName,
          type: 'tokutei', // デフォルト
        })
        .returning();
      accountId = newAccount.id;
    } else {
      accountId = accountRecords[0].id;
    }

    // バッチ作成
    const [batch] = await db
      .insert(importBatches)
      .values({
        source: 'csv',
        idempotencyKey: `csv-${Date.now()}-${Math.random()}`,
        filename: file.name,
        rowCount: parsedPositions.length,
        status: 'committed',
      })
      .returning();

    // スナップショット作成
    const [snapshot] = await db
      .insert(snapshots)
      .values({
        asOf,
        source: 'csv',
        batchId: batch.id,
      })
      .returning();

    // 各ポジションを書き込み
    let imported = 0;
    const importErrors: CSVError[] = [];

    for (let i = 0; i < parsedPositions.length; i++) {
      const pos = parsedPositions[i];
      const row = i + 2;

      try {
        // Instrument 取得または作成
        let instrumentRecords = await db
          .select()
          .from(instruments)
          .where(eq(instruments.symbol, pos.symbol))
          .limit(1);

        let instrumentId: string;
        if (instrumentRecords.length === 0) {
          const [newInstrument] = await db
            .insert(instruments)
            .values({
              symbol: pos.symbol,
              name: pos.name,
              assetClass: 'jp_stock', // デフォルト
              currency: pos.currency,
              unitBasis: '1',
            })
            .returning();
          instrumentId = newInstrument.id;
        } else {
          instrumentId = instrumentRecords[0].id;
        }

        // Position 作成
        await db.insert(positions).values({
          snapshotId: snapshot.id,
          accountId,
          instrumentId,
          quantity: pos.quantity,
          avgCost: pos.avgCost,
          price: pos.price,
          fxRateToJpy: pos.currency === 'USD' ? '150' : '1', // 仮の為替レート
        });

        imported++;
      } catch (error) {
        importErrors.push({
          row,
          message: error instanceof Error ? error.message : '書き込みエラー',
        });
      }
    }

    return NextResponse.json(
      {
        batchId: batch.id,
        imported,
        errors: importErrors,
        skipped: importErrors.length,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: 'インポートに失敗しました' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
