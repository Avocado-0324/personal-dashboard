import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { accounts } from '@/db/schema';

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
    const { name, type, broker } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: '需要 name 和 type' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getDb();
    const [account] = await db
      .insert(accounts)
      .values({ name, type, broker })
      .returning();

    return NextResponse.json(
      { account },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Create account error:', error);
    return NextResponse.json(
      { error: '创建账户失败' },
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
    const allAccounts = await db.select().from(accounts);

    return NextResponse.json(
      { accounts: allAccounts },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Get accounts error:', error);
    return NextResponse.json(
      { error: '获取账户失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
