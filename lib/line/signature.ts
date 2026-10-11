import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify LINE Messaging API `x-line-signature`.
 * digest = base64(HMAC-SHA256(raw request body, channel secret))
 */
export function verifyLineSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  channelSecret: string
): boolean {
  if (!signatureHeader || !channelSecret) {
    return false;
  }

  const digest = createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');

  const expected = Buffer.from(digest);
  const provided = Buffer.from(signatureHeader);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
