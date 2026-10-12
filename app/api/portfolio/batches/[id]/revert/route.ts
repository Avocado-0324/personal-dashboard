import { NextRequest, NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db/client';
import { isUuid } from '@/lib/validation';
import { revertImportBatch } from '@/modules/portfolio/http-writes';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: '无效的批次 id' },
        { status: 400 }
      );
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: '数据库未配置' },
        { status: 500 }
      );
    }

    const outcome = await revertImportBatch(id);

    if (outcome === 'not_found') {
      return NextResponse.json(
        { error: '批次不存在' },
        { status: 404 }
      );
    }

    if (outcome === 'already_reverted') {
      return NextResponse.json(
        { error: '批次已撤销' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Revert batch error:', error);
    return NextResponse.json(
      { error: '撤销失败' },
      { status: 500 }
    );
  }
}
