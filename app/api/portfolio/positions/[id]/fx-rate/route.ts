import { NextRequest, NextResponse } from 'next/server';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { positions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { fxRateToJpy } = body;

    if (!fxRateToJpy) {
      return NextResponse.json(
        { error: '需要 fxRateToJpy' },
        { status: 400 }
      );
    }

    const fxRate = parseFloat(fxRateToJpy);
    if (isNaN(fxRate) || fxRate <= 0) {
      return NextResponse.json(
        { error: '无效的汇率' },
        { status: 400 }
      );
    }

    const db = getPoolDb();

    await db
      .update(positions)
      .set({ fxRateToJpy: fxRate.toString() })
      .where(eq(positions.id, id));

    return NextResponse.json(
      { success: true },
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
