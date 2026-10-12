const BOT_MENTION_FALLBACK = '@秋宝管家';

export type LineMentionee = {
  index?: number;
  length?: number;
  userId?: string;
  type?: string;
  isSelf?: boolean;
};

export type LineEvent = {
  type?: string;
  timestamp?: number;
  webhookEventId?: string;
  replyToken?: string;
  deliveryContext?: {
    isRedelivery?: boolean;
  };
  source?: {
    type?: string;
    groupId?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    id?: string;
    text?: string;
    quoteToken?: string;
    mention?: {
      mentionees?: LineMentionee[];
    };
  };
};

export type ForwardPayload = {
  v: 1;
  groupId: string;
  userId: string;
  text: string;
  messageId: string;
  webhookEventId: string;
  replyToken: string;
  quoteToken: string;
  eventTs: number;
  receivedAt: number;
  isRedelivery: boolean;
};

export function isBotMentioned(event: LineEvent): boolean {
  const mentionees = event.message?.mention?.mentionees;
  if (Array.isArray(mentionees) && mentionees.some((m) => m.isSelf === true)) {
    return true;
  }
  const text = event.message?.text ?? '';
  return text.includes(BOT_MENTION_FALLBACK);
}

export function stripBotMention(text: string, event?: LineEvent): string {
  const mentionees = event?.message?.mention?.mentionees;
  if (Array.isArray(mentionees)) {
    const selfMentions = mentionees
      .filter(
        (m) =>
          m.isSelf === true &&
          typeof m.index === 'number' &&
          typeof m.length === 'number' &&
          m.index >= 0 &&
          m.length > 0
      )
      .sort((a, b) => (b.index as number) - (a.index as number));

    if (selfMentions.length > 0) {
      let result = text;
      for (const mention of selfMentions) {
        const start = mention.index as number;
        const end = start + (mention.length as number);
        if (start > result.length) continue;
        result = result.slice(0, start) + result.slice(Math.min(end, result.length));
      }
      return result.replace(/\s+/g, ' ').trim();
    }
  }

  return text.replace(new RegExp(BOT_MENTION_FALLBACK, 'g'), '').replace(/\s+/g, ' ').trim();
}

function passthroughString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function filterForwardableEvents(
  events: unknown,
  allowedGroupId?: string,
  receivedAt: number = 0
): ForwardPayload[] {
  if (!allowedGroupId) {
    return [];
  }

  if (!Array.isArray(events)) {
    return [];
  }

  const payloads: ForwardPayload[] = [];

  for (const raw of events) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const event = raw as LineEvent;

    if (event.type !== 'message') continue;
    if (event.message?.type !== 'text') continue;
    if (event.source?.type !== 'group') continue;
    if (typeof event.source.groupId !== 'string' || event.source.groupId.length === 0) {
      continue;
    }
    if (event.source.groupId !== allowedGroupId) {
      continue;
    }
    if (typeof event.message.text !== 'string') continue;
    if (!isBotMentioned(event)) continue;

    payloads.push({
      v: 1,
      groupId: event.source.groupId,
      userId: passthroughString(event.source.userId),
      text: event.message.text,
      messageId: passthroughString(event.message.id),
      webhookEventId: passthroughString(event.webhookEventId),
      replyToken: passthroughString(event.replyToken),
      quoteToken: passthroughString(event.message.quoteToken),
      eventTs: typeof event.timestamp === 'number' ? event.timestamp : 0,
      receivedAt,
      isRedelivery: event.deliveryContext?.isRedelivery === true,
    });
  }

  return payloads;
}
