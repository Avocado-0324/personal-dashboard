import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { auth } from '@/lib/auth';
import { probeHttpSelect1, probeHttpTransaction } from '@/db/diag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ingestKeyAuthorized(authHeader: string | null): boolean {
  const expectedKey = process.env.PORTFOLIO_INGEST_KEY;
  if (!expectedKey || expectedKey.length < 32) {
    return false;
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const providedKey = authHeader.slice(7);
  const expectedBuffer = Buffer.from(expectedKey);
  const providedBuffer = Buffer.from(providedKey);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) {
    return true;
  }
  return ingestKeyAuthorized(request.headers.get('authorization'));
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { error: '未授权' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const [httpSelect1, httpTransaction] = await Promise.all([
    probeHttpSelect1(),
    probeHttpTransaction(),
  ]);

  return NextResponse.json(
    {
      httpSelect1,
      httpTransaction,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
