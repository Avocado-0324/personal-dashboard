import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions, cashBalances, importBatches } from '@/db/schema';
import { decodeShiftJIS, parseSBIPositions, type CSVError } from '@/modules/portfolio/import/sbi';
import { eq, and, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

function inferAssetClassAndUnitBasis(symbol: string, name: string, currency: string): { 
  assetClass: 'jp_stock' | 'us_stock' | 'fund' | 'etf' | 'bond' | 'reit' | 'crypto' | 'other'; 
  unitBasis: string;
} {
  const nameUpper = name.toUpperCase();
  const symbolUpper = symbol.toUpperCase();
  
  if (
    nameUpper.includes('\u30d5\u30a1\u30f3\u30c9') || 
    nameUpper.includes('\u6295\u4fe1') ||
    nameUpper.includes('FUND') ||
    symbol.length > 6 ||
    /^[A-Z]{2}\d{6}$/.test(symbol)
  ) {
    return { assetClass: 'fund', unitBasis: '10000' };
  }
  
  if (currency === 'USD' || currency === 'HKD') {
    return { assetClass: 'us_stock', unitBasis: '1' };
  }
  
  return { assetClass: 'jp_stock', unitBasis: '1' };
}

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
    const fileBuffer = Buffer.from(buffer);
    const csvText = decodeShiftJIS(buffer);
    
    // 计算确定性幂等键
    const idempotencyKey = createHash('sha256')
      .update(fileBuffer)
      .update(asOf)
      .update(accountName)
      .digest('hex');

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

    // 检查幂等键（只对未撤销的批次）
    const db = getPoolDb();
    
    const existingBatches = await db
      .select()
      .from(importBatches)
      .where(and(
        eq(importBatches.idempotencyKey, idempotencyKey),
        sql`${importBatches.status} <> 'reverted'`
      ))
      .limit(1);
    
    if (existingBatches.length > 0 && existingBatches[0].status === 'committed') {
      const batch = existingBatches[0];
      const importTime = new Date(batch.createdAt!);
      const timeStr = importTime.toLocaleString('zh-CN', {
        timeZone: 'Asia/Tokyo',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).replace('月', '月').replace('日', '日');
      
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
            idempotencyKey,
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
          // 获取或创建 Instrument（按 symbol + currency）
          let instrumentRecords = await tx
            .select()
            .from(instruments)
            .where(and(
              eq(instruments.symbol, pos.symbol),
              eq(instruments.currency, pos.currency)
            ))
            .limit(1);

          let instrumentId: string;
          if (instrumentRecords.length === 0) {
            const { assetClass, unitBasis } = inferAssetClassAndUnitBasis(
              pos.symbol,
              pos.name,
              pos.currency
            );
            
            const [newInstrument] = await tx
              .insert(instruments)
              .values({
                symbol: pos.symbol,
                name: pos.name,
                assetClass,
                currency: pos.currency,
                unitBasis,
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
    } catch (txError: any) {
      // 处理唯一约束冲突（并发导入）
      if (txError?.code === '23505' && txError?.constraint?.includes('idempotency_key')) {
        // 并发冲突，重新查询已导入的批次
        const existingBatches = await db
          .select()
          .from(importBatches)
          .where(and(
            eq(importBatches.idempotencyKey, idempotencyKey),
            sql`${importBatches.status} <> 'reverted'`
          ))
          .limit(1);
        
        if (existingBatches.length > 0) {
          const batch = existingBatches[0];
          const importTime = new Date(batch.createdAt!);
          const timeStr = importTime.toLocaleString('zh-CN', {
            timeZone: 'Asia/Tokyo',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).replace('月', '月').replace('日', '日');
          
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
      }
      
      // 其他事务失败
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
