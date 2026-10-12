import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'crypto';
import { handleLineWebhook } from '../webhook';

const SECRET = 'test-channel-secret';
const GROK_URL = 'https://grokbot.example.test/webhook';
const GROK_KEY = 'grok-test-key';
const GROUP_ID = 'C0123456789abcdef';
const USER_ID = 'Uabcdef0123456789';
const OTHER_GROUP = 'Cffffffffffffffff';
const REPLY_TOKEN = 'reply-token-exact-value-001';
const QUOTE_TOKEN = 'quote-token-exact-value-002';
const MESSAGE_ID = 'msg-111';
const WEBHOOK_EVENT_ID = 'evt-222';
const EVENT_TS = 1_700_000_000_000;
const RECEIVED_AT = 1_700_000_100_000;

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('base64');
}

function mentionEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message',
    timestamp: EVENT_TS,
    webhookEventId: WEBHOOK_EVENT_ID,
    replyToken: REPLY_TOKEN,
    deliveryContext: { isRedelivery: false },
    source: { type: 'group', groupId: GROUP_ID, userId: USER_ID },
    message: {
      type: 'text',
      id: MESSAGE_ID,
      text: '@秋宝管家 今晚吃什么',
      quoteToken: QUOTE_TOKEN,
      mention: { mentionees: [{ index: 0, length: 5, isSelf: true }] },
    },
    ...overrides,
  };
}

function signedRequest(body: unknown, signature?: string | null): Request {
  const raw = JSON.stringify(body);
  const headers = new Headers();
  if (signature !== null) {
    headers.set('x-line-signature', signature ?? sign(raw));
  }
  return new Request('https://dashboard.example.test/api/line/webhook', {
    method: 'POST',
    headers,
    body: raw,
  });
}

function collectLogs(spies: Array<{ mock: { calls: unknown[][] } }>): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    .join('\n');
}

describe('handleLineWebhook', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn<typeof fetch>();
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let infoSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LINE_CHANNEL_SECRET = SECRET;
    process.env.GROKBOT_WEBHOOK_URL = GROK_URL;
    process.env.GROKBOT_WEBHOOK_KEY = GROK_KEY;
    process.env.LINE_ALLOWED_GROUP_ID = GROUP_ID;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  async function post(request: Request) {
    const jobs: Array<() => Promise<void>> = [];
    const response = await handleLineWebhook(
      request,
      (job) => {
        jobs.push(job);
      },
      () => RECEIVED_AT
    );
    await Promise.all(jobs.map((job) => job()));
    return { response, forwarded: jobs.length };
  }

  it('11 个字段原样透传，replyToken/quoteToken 一字不差', async () => {
    const { response } = await post(signedRequest({ events: [mentionEvent()] }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GROK_URL);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({
      v: 1,
      groupId: GROUP_ID,
      userId: USER_ID,
      text: '@秋宝管家 今晚吃什么',
      messageId: MESSAGE_ID,
      webhookEventId: WEBHOOK_EVENT_ID,
      replyToken: REPLY_TOKEN,
      quoteToken: QUOTE_TOKEN,
      eventTs: EVENT_TS,
      receivedAt: RECEIVED_AT,
      isRedelivery: false,
    });
    expect(body.replyToken).toBe(REPLY_TOKEN);
    expect(body.quoteToken).toBe(QUOTE_TOKEN);
  });

  it('重投事件 isRedelivery=true', async () => {
    await post(
      signedRequest({
        events: [mentionEvent({ deliveryContext: { isRedelivery: true } })],
      })
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.isRedelivery).toBe(true);
  });

  it('日志里搜不到 replyToken 和 quoteToken', async () => {
    fetchMock.mockResolvedValue(new Response('fail', { status: 502 }));
    await post(signedRequest({ events: [mentionEvent()] }));
    const logs = collectLogs([logSpy, errorSpy, warnSpy, infoSpy]);
    expect(logs).not.toContain(REPLY_TOKEN);
    expect(logs).not.toContain(QUOTE_TOKEN);
    expect(logs.toLowerCase()).not.toContain('replytoken');
    expect(logs.toLowerCase()).not.toContain('quotetoken');
  });

  it('签名缺失返回 401', async () => {
    const { response, forwarded } = await post(signedRequest({ events: [mentionEvent()] }, null));
    expect(response.status).toBe(401);
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('签名错误返回 401', async () => {
    const { response, forwarded } = await post(
      signedRequest({ events: [mentionEvent()] }, sign('{"tampered":true}'))
    );
    expect(response.status).toBe(401);
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未 @ 时转发 0 条', async () => {
    const { forwarded } = await post(
      signedRequest({
        events: [
          mentionEvent({
            message: { type: 'text', id: MESSAGE_ID, text: '普通聊天', quoteToken: QUOTE_TOKEN },
          }),
        ],
      })
    );
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('别的群转发 0 条', async () => {
    const { forwarded } = await post(
      signedRequest({
        events: [
          mentionEvent({
            source: { type: 'group', groupId: OTHER_GROUP, userId: USER_ID },
          }),
        ],
      })
    );
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未配群 ID 时转发 0 条', async () => {
    delete process.env.LINE_ALLOWED_GROUP_ID;
    const { forwarded } = await post(signedRequest({ events: [mentionEvent()] }));
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('群 ID 为空时转发 0 条', async () => {
    process.env.LINE_ALLOWED_GROUP_ID = '   ';
    const { forwarded } = await post(signedRequest({ events: [mentionEvent()] }));
    expect(forwarded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('webhook 不调 LINE Reply / Push', async () => {
    await post(signedRequest({ events: [mentionEvent()] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toEqual([GROK_URL]);
    expect(calledUrls.join(' ')).not.toMatch(/api\.line\.me|\/v2\/bot\/message\/(reply|push)/);
  });
});
