import { NextRequest, NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db/client';
import Decimal from 'decimal.js';
import { isCurrencyCode, isFxRateString, isUuid } from '@/lib/validation';
import { updateSnapshotFxRate } from '@/modules/portfolio/http-writes';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的快照 id' },
        { status: 400 }
      );
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { currency, rateToJpy } = body;

    if (!currency || !rateToJpy) {
      return NextResponse.json(
        { error: '需要 currency 和 rateToJpy' },
        { status: 400 }
      );
    }

    if (!isCurrencyCode(currency)) {
      return NextResponse.json(
        { error: 'currency 必须是 3 位大写字母' },
        { status: 400 }
      );
    }

    if (currency === 'JPY') {
      return NextResponse.json(
        { error: 'JPY 汇率不能修改' },
        { status: 400 }
      );
    }

    if (!isFxRateString(rateToJpy)) {
      return NextResponse.json(
        { error: '汇率格式无效' },
        { status: 400 }
      );
    }

    let rate: Decimal;
    try {
      rate = new Decimal(rateToJpy);
    } catch {
      return NextResponse.json(
        { error: '汇率格式无效' },
        { status: 400 }
      );
    }

    if (rate.lte(0)) {
      return NextResponse.json(
        { error: '汇率必须大于 0' },
        { status: 400 }
      );
    }

    const { updatedCount } = await updateSnapshotFxRate(id, currency, rateToJpy);

    return NextResponse.json(
      { updatedCount },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Update FX rate error:', error);
    return NextResponse.json(
      { error: '更新失败' },
      { status: 500 }
    );
  }
}
