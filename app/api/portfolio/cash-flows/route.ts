import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { cashFlows, accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const { accountName, date, direction, amountJpy, note } = body;

    if (!date || !direction || !amountJpy) {
      return NextResponse.json(
        { error: 'date, direction, amountJpy が必要です' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();

    // アカウント取得
    let accountId: string | null = null;
    if (accountName) {
      const accountRecords = await db
        .select()
        .from(accounts)
        .where(eq(accounts.name, accountName))
        .limit(1);
      
      if (accountRecords.length > 0) {
        accountId = accountRecords[0].id;
      }
    }

    const [cashFlow] = await db
      .insert(cashFlows)
      .values({
        accountId,
        date,
        direction,
        amountJpy,
        note,
        source: 'manual',
      })
      .returning();

    return NextResponse.json(
      { cashFlow },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Create cash flow error:', error);
    return NextResponse.json(
      { error: '入出金作成に失敗しました' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET() {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();
    const allCashFlows = await db
      .select({
        cashFlow: cashFlows,
        account: accounts,
      })
      .from(cashFlows)
      .leftJoin(accounts, eq(cashFlows.accountId, accounts.id))
      .orderBy(cashFlows.date);

    return NextResponse.json(
      { cashFlows: allCashFlows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Get cash flows error:', error);
    return NextResponse.json(
      { error: '入出金取得に失敗しました' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
