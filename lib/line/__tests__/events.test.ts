import { describe, it, expect } from '@jest/globals';
import {
  filterForwardableEvents,
  isBotMentioned,
  stripBotMention,
  type LineEvent,
} from '../events';

const GROUP_ID = 'C0123456789abcdef';
const USER_ID = 'Uabcdef0123456789';
const OTHER_GROUP = 'Cffffffffffffffff';
const RECEIVED_AT = 1_700_000_100_000;
const REPLY_TOKEN = 'reply-token-exact-value-001';
const QUOTE_TOKEN = 'quote-token-exact-value-002';
const MESSAGE_ID = 'msg-111';
const WEBHOOK_EVENT_ID = 'evt-222';

function textGroupEvent(overrides: Partial<LineEvent> = {}): LineEvent {
  return {
    type: 'message',
    timestamp: 1_700_000_000_000,
    webhookEventId: WEBHOOK_EVENT_ID,
    replyToken: REPLY_TOKEN,
    deliveryContext: { isRedelivery: false },
    source: { type: 'group', groupId: GROUP_ID, userId: USER_ID },
    message: {
      type: 'text',
      id: MESSAGE_ID,
      text: '@秋宝管家 今晚吃什么',
      quoteToken: QUOTE_TOKEN,
      mention: {
        mentionees: [{ index: 0, length: 5, isSelf: true }],
      },
    },
    ...overrides,
  };
}

const v1Fields = [
  'v',
  'groupId',
  'userId',
  'text',
  'messageId',
  'webhookEventId',
  'replyToken',
  'quoteToken',
  'eventTs',
  'receivedAt',
  'isRedelivery',
] as const;

describe('isBotMentioned', () => {
  it('returns true when mentionees contains isSelf: true', () => {
    expect(isBotMentioned(textGroupEvent())).toBe(true);
  });

  it('falls back to the display name @秋宝管家 when mention metadata is missing', () => {
    const event = textGroupEvent({
      message: { type: 'text', text: '嗨 @秋宝管家 帮我看看' },
    });
    expect(isBotMentioned(event)).toBe(true);
  });

  it('returns false when the bot is not mentioned', () => {
    const event = textGroupEvent({
      message: { type: 'text', text: '今晚吃什么' },
    });
    expect(isBotMentioned(event)).toBe(false);
  });
});

describe('stripBotMention', () => {
  it('removes the isSelf mention span from the text', () => {
    const event = textGroupEvent();
    expect(stripBotMention(event.message!.text!, event)).toBe('今晚吃什么');
  });

  it('falls back to stripping @秋宝管家', () => {
    expect(stripBotMention('请问 @秋宝管家 明天天气')).toBe('请问 明天天气');
  });
});

describe('filterForwardableEvents', () => {
  it('透传 v1 契约 11 个字段且不加工 text / token', () => {
    const payloads = filterForwardableEvents([textGroupEvent()], GROUP_ID, RECEIVED_AT);
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual([...v1Fields].sort());
    expect(payloads[0]).toEqual({
      v: 1,
      groupId: GROUP_ID,
      userId: USER_ID,
      text: '@秋宝管家 今晚吃什么',
      messageId: MESSAGE_ID,
      webhookEventId: WEBHOOK_EVENT_ID,
      replyToken: REPLY_TOKEN,
      quoteToken: QUOTE_TOKEN,
      eventTs: 1_700_000_000_000,
      receivedAt: RECEIVED_AT,
      isRedelivery: false,
    });
    expect(payloads[0].replyToken).toBe(REPLY_TOKEN);
    expect(payloads[0].quoteToken).toBe(QUOTE_TOKEN);
  });

  it('重投事件 isRedelivery=true', () => {
    const event = textGroupEvent({
      deliveryContext: { isRedelivery: true },
    });
    const payloads = filterForwardableEvents([event], GROUP_ID, RECEIVED_AT);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].isRedelivery).toBe(true);
  });

  it('forwards when mention metadata is missing but the text contains @秋宝管家', () => {
    const event = textGroupEvent({
      message: {
        type: 'text',
        id: MESSAGE_ID,
        text: '@秋宝管家 提醒买奶粉',
        quoteToken: QUOTE_TOKEN,
      },
    });
    const payloads = filterForwardableEvents([event], GROUP_ID, RECEIVED_AT);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].text).toBe('@秋宝管家 提醒买奶粉');
  });

  it('skips non-message events', () => {
    expect(filterForwardableEvents([{ type: 'follow', source: { type: 'user' } }], GROUP_ID, RECEIVED_AT)).toEqual([]);
  });

  it('skips non-text messages', () => {
    const event = textGroupEvent({
      message: { type: 'image' },
    });
    expect(filterForwardableEvents([event], GROUP_ID, RECEIVED_AT)).toEqual([]);
  });

  it('skips non-group sources', () => {
    const event = textGroupEvent({
      source: { type: 'user', userId: USER_ID },
    });
    expect(filterForwardableEvents([event], GROUP_ID, RECEIVED_AT)).toEqual([]);
  });

  it('未 @ 时转发 0 条', () => {
    const event = textGroupEvent({
      message: { type: 'text', text: '普通聊天' },
    });
    expect(filterForwardableEvents([event], GROUP_ID, RECEIVED_AT)).toEqual([]);
  });

  it('别的群转发 0 条', () => {
    expect(filterForwardableEvents([textGroupEvent()], OTHER_GROUP, RECEIVED_AT)).toEqual([]);
  });

  it('未配群 ID 时转发 0 条（fail-closed）', () => {
    expect(filterForwardableEvents([textGroupEvent()])).toEqual([]);
    expect(filterForwardableEvents([textGroupEvent()], undefined, RECEIVED_AT)).toEqual([]);
    expect(filterForwardableEvents([textGroupEvent()], '', RECEIVED_AT)).toEqual([]);
  });

  it('keeps the allowed group when LINE_ALLOWED_GROUP_ID is set', () => {
    const payloads = filterForwardableEvents([textGroupEvent()], GROUP_ID, RECEIVED_AT);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].groupId).toBe(GROUP_ID);
  });

  it('returns an empty list for LINE verify payloads and non-arrays', () => {
    expect(filterForwardableEvents([], GROUP_ID, RECEIVED_AT)).toEqual([]);
    expect(filterForwardableEvents(undefined, GROUP_ID, RECEIVED_AT)).toEqual([]);
    expect(filterForwardableEvents({ events: [] }, GROUP_ID, RECEIVED_AT)).toEqual([]);
  });

  it('forwards only matching events from a mixed batch', () => {
    const keep = textGroupEvent();
    const skip = textGroupEvent({
      message: { type: 'text', text: '无提及' },
    });
    const payloads = filterForwardableEvents([skip, keep, { type: 'unsend' }], GROUP_ID, RECEIVED_AT);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].text).toBe('@秋宝管家 今晚吃什么');
  });
});
