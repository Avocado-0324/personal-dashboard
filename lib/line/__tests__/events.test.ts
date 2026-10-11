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

function textGroupEvent(overrides: Partial<LineEvent> = {}): LineEvent {
  return {
    type: 'message',
    timestamp: 1_700_000_000_000,
    source: { type: 'group', groupId: GROUP_ID, userId: USER_ID },
    message: {
      type: 'text',
      text: '@秋宝管家 今晚吃什么',
      mention: {
        mentionees: [{ index: 0, length: 5, isSelf: true }],
      },
    },
    ...overrides,
  };
}

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
  it('forwards a group text message that mentions the bot', () => {
    expect(filterForwardableEvents([textGroupEvent()])).toEqual([
      {
        groupId: GROUP_ID,
        userId: USER_ID,
        text: '今晚吃什么',
        timestamp: 1_700_000_000_000,
      },
    ]);
  });

  it('forwards when mention metadata is missing but the text contains @秋宝管家', () => {
    const event = textGroupEvent({
      message: { type: 'text', text: '@秋宝管家 提醒买奶粉' },
    });
    expect(filterForwardableEvents([event])).toEqual([
      {
        groupId: GROUP_ID,
        userId: USER_ID,
        text: '提醒买奶粉',
        timestamp: 1_700_000_000_000,
      },
    ]);
  });

  it('skips non-message events', () => {
    expect(filterForwardableEvents([{ type: 'follow', source: { type: 'user' } }])).toEqual([]);
  });

  it('skips non-text messages', () => {
    const event = textGroupEvent({
      message: { type: 'image' },
    });
    expect(filterForwardableEvents([event])).toEqual([]);
  });

  it('skips non-group sources', () => {
    const event = textGroupEvent({
      source: { type: 'user', userId: USER_ID },
    });
    expect(filterForwardableEvents([event])).toEqual([]);
  });

  it('skips group messages that do not mention the bot', () => {
    const event = textGroupEvent({
      message: { type: 'text', text: '普通聊天' },
    });
    expect(filterForwardableEvents([event])).toEqual([]);
  });

  it('skips groups other than LINE_ALLOWED_GROUP_ID when that env is set', () => {
    expect(filterForwardableEvents([textGroupEvent()], OTHER_GROUP)).toEqual([]);
  });

  it('keeps the allowed group when LINE_ALLOWED_GROUP_ID is set', () => {
    const payloads = filterForwardableEvents([textGroupEvent()], GROUP_ID);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].groupId).toBe(GROUP_ID);
  });

  it('returns an empty list for LINE verify payloads and non-arrays', () => {
    expect(filterForwardableEvents([])).toEqual([]);
    expect(filterForwardableEvents(undefined)).toEqual([]);
    expect(filterForwardableEvents({ events: [] })).toEqual([]);
  });

  it('forwards only matching events from a mixed batch', () => {
    const keep = textGroupEvent();
    const skip = textGroupEvent({
      message: { type: 'text', text: '无提及' },
    });
    expect(filterForwardableEvents([skip, keep, { type: 'unsend' }])).toEqual([
      {
        groupId: GROUP_ID,
        userId: USER_ID,
        text: '今晚吃什么',
        timestamp: 1_700_000_000_000,
      },
    ]);
  });
});
