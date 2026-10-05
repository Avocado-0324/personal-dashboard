import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { importBatches } from '@/db/schema';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();
    const batches = await db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt));

    return NextResponse.json(
      { batches },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Get batches error:', error);
    return NextResponse.json(
      { error: '获取批次失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
