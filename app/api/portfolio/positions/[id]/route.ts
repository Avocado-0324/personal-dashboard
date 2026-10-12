import { NextRequest, NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db/client';
import { isUuid } from '@/lib/validation';
import { movePositionHttp } from '@/modules/portfolio/http-writes';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的持仓 id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const { accountId } = body;

    if (!isUuid(accountId)) {
      return NextResponse.json(
        { error: '无效的账户 id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const result = await movePositionHttp(id, accountId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Update position error:', error);
    return NextResponse.json(
      { error: '更新持仓失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
