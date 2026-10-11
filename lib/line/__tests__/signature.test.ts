import { describe, it, expect } from '@jest/globals';
import { createHmac } from 'crypto';
import { verifyLineSignature } from '../signature';

const SECRET = 'test-channel-secret';

function sign(body: string | Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

describe('verifyLineSignature', () => {
  it('accepts a matching HMAC-SHA256 base64 signature over the raw body', () => {
    const body = '{"destination":"Uxxx","events":[]}';
    expect(verifyLineSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts a Buffer body (same bytes as the string)', () => {
    const body = '{"events":[{"type":"message"}]}';
    const raw = Buffer.from(body, 'utf8');
    expect(verifyLineSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(verifyLineSignature('{}', null, SECRET)).toBe(false);
    expect(verifyLineSignature('{}', undefined, SECRET)).toBe(false);
    expect(verifyLineSignature('{}', '', SECRET)).toBe(false);
  });

  it('rejects a missing channel secret', () => {
    const body = '{}';
    expect(verifyLineSignature(body, sign(body), '')).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = '{"events":[]}';
    const signature = sign(body);
    expect(verifyLineSignature('{"events":[{}]}', signature, SECRET)).toBe(false);
  });

  it('rejects a signature produced with a different secret', () => {
    const body = '{"events":[]}';
    expect(verifyLineSignature(body, sign(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a short or garbage signature without throwing', () => {
    const body = '{"events":[]}';
    expect(verifyLineSignature(body, 'abc', SECRET)).toBe(false);
    expect(verifyLineSignature(body, '%%%not-base64%%%', SECRET)).toBe(false);
  });
});
