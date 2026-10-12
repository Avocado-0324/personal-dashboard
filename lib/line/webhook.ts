import { verifyLineSignature } from '@/lib/line/signature';
import { filterForwardableEvents } from '@/lib/line/events';
import { forwardToGrokBot } from '@/lib/line/forward';

export type WebhookScheduler = (job: () => Promise<void>) => void;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function missingConfigResponse() {
  console.error('LINE webhook missing required environment variables');
  return jsonResponse({ error: 'Server configuration error' }, 500);
}

export async function handleLineWebhook(
  request: Request,
  schedule: WebhookScheduler,
  now: () => number = Date.now
): Promise<Response> {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const grokUrl = process.env.GROKBOT_WEBHOOK_URL;
  const grokKey = process.env.GROKBOT_WEBHOOK_KEY;

  if (!channelSecret || !grokUrl || !grokKey) {
    return missingConfigResponse();
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-line-signature');

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let events: unknown = [];
  try {
    if (rawBody.length > 0) {
      const parsed = JSON.parse(rawBody.toString('utf8')) as { events?: unknown };
      events = parsed?.events ?? [];
    }
  } catch {
    return Response.json({ ok: true }, { status: 200 });
  }

  const allowedGroupId = (process.env.LINE_ALLOWED_GROUP_ID ?? '').trim() || undefined;
  const payloads = filterForwardableEvents(events, allowedGroupId, now());

  if (payloads.length > 0) {
    schedule(async () => {
      await Promise.all(payloads.map((payload) => forwardToGrokBot(grokUrl, grokKey, payload)));
    });
  }

  return Response.json({ ok: true }, { status: 200 });
}
