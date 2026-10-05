import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions, importBatches } from '@/db/schema';
import { decodeShiftJIS, parseSBIHoldings, computeIdempotencyKey } from '@/modules/portfolio/import/sbi';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { isUniqueViolation } from '@/db/utils';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * SBI CSV 导入 API
 * 
 * 导入语义：
 * - 只写入/覆盖本次解析出的账户（由 parsedPositions 的 accountName 集合决定）
 * - 文件中未出现的账户不受影响，保持原有持仓不变
 */

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

    // Shift_JIS 解码
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);
    const csvText = decodeShiftJIS(buffer);
    
    // 计算幂等键（不含 accountName）
    const idempotencyKey = computeIdempotencyKey(fileBuffer, asOf);

    // 解析
    const { positions: parsedPositions, errors, accountSummaries } = parseSBIHoldings(csvText);

    if (dryRun) {
      // dry-run：返回预览
      return NextResponse.json(
        {
          accountSummaries: accountSummaries.map(s => ({
            accountName: s.accountName,
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
        // 获取文件中涉及的所有账户名
        const accountNames = Array.from(new Set(parsedPositions.map(p => p.accountName)));
        
        // 获取或创建所有账户
        const accountMap = new Map<string, string>();
        
        for (const accountName of accountNames) {
          const existingAccounts = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.name, accountName))
            .limit(1);

          let accountId: string;
          if (existingAccounts.length === 0) {
            // 从 parsedPositions 中找到该账户的类型
            const accountType = parsedPositions.find(p => p.accountName === accountName)?.accountType || 'tokutei';
            
            const [newAccount] = await tx
              .insert(accounts)
              .values({
                name: accountName,
                type: accountType,
                broker: 'SBI',
              })
              .returning();
            accountId = newAccount.id;
          } else {
            accountId = existingAccounts[0].id;
          }
          
          accountMap.set(accountName, accountId);
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
          const accountId = accountMap.get(pos.accountName)!;
          
          // 获取或创建 Instrument
          // 股票：按 symbol + JPY
          // 基金：按 symbol（已标准化）+ JPY
          let instrumentRecords = await tx
            .select()
            .from(instruments)
            .where(and(
              eq(instruments.symbol, pos.symbol),
              eq(instruments.currency, 'JPY')
            ))
            .limit(1);

          let instrumentId: string;
          if (instrumentRecords.length === 0) {
            const [newInstrument] = await tx
              .insert(instruments)
              .values({
                symbol: pos.symbol,
                name: pos.name,
                assetClass: pos.assetClass,
                currency: 'JPY',
                unitBasis: pos.unitBasis,
              })
              .returning();
            instrumentId = newInstrument.id;
          } else {
            instrumentId = instrumentRecords[0].id;
          }

          // Position 创建
          await tx.insert(positions).values({
            snapshotId: snapshot.id,
            accountId,
            instrumentId,
            quantity: pos.quantity,
            avgCost: pos.avgCost,
            price: pos.price,
            fxRateToJpy: '1', // JPY 汇率固定为 1
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
      if (isUniqueViolation(txError, 'import_batches_idempotency_key_unique_not_reverted')) {
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
