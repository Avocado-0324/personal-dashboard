import { NextRequest, NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db/client';
import { isCurrencyCode } from '@/lib/validation';
import { createManualPositions, type ManualAccountType } from '@/modules/portfolio/http-writes';

export const dynamic = 'force-dynamic';

const ACCOUNT_TYPES = new Set<ManualAccountType>(['tokutei', 'nisa_growth', 'nisa_tsumitate', 'other']);

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const { asOf, accountName, accountType, positions: positionsData } = body;

    if (!asOf || !accountName || !positionsData || positionsData.length === 0) {
      return NextResponse.json(
        { error: '需要 asOf, accountName, positions' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (accountType != null && !ACCOUNT_TYPES.has(accountType)) {
      return NextResponse.json(
        { error: '账户类型无效' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    for (const pos of positionsData) {
      if (pos.currency && !isCurrencyCode(pos.currency)) {
        return NextResponse.json(
          { error: 'currency 必须是 3 位大写字母' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const result = await createManualPositions({
      asOf,
      accountName,
      accountType,
      positions: positionsData,
    });

    return NextResponse.json(
      { snapshotId: result.snapshotId, created: result.created },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Create positions error:', error);
    return NextResponse.json(
      { error: '创建持仓失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
