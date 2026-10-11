import { after, NextResponse } from 'next/server';
import { verifyLineSignature } from '@/lib/line/signature';
import { filterForwardableEvents } from '@/lib/line/events';
import { forwardToGrokBot } from '@/lib/line/forward';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function missingConfigResponse() {
  console.error('LINE webhook missing required environment variables');
  return NextResponse.json(
    { error: 'Server configuration error' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const grokUrl = process.env.GROKBOT_WEBHOOK_URL;
  const grokKey = process.env.GROKBOT_WEBHOOK_KEY;

  if (!channelSecret || !grokUrl || !grokKey) {
    return missingConfigResponse();
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-line-signature');

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let events: unknown = [];
  try {
    if (rawBody.length > 0) {
      const parsed = JSON.parse(rawBody.toString('utf8')) as { events?: unknown };
      events = parsed?.events ?? [];
    }
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const allowedGroupId = process.env.LINE_ALLOWED_GROUP_ID || undefined;
  const payloads = filterForwardableEvents(events, allowedGroupId);

  if (payloads.length > 0) {
    after(async () => {
      await Promise.all(payloads.map((payload) => forwardToGrokBot(grokUrl, grokKey, payload)));
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
