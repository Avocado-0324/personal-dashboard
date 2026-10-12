import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { extractWriteErrorFields, logWriteError } from '../write-error-log';

describe('write-error-log', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('提取 error.cause.code，并打一行 JSON', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('connect failed');
    (error as Error & { cause: { code: string } }).cause = { code: 'ECONNRESET' };

    logWriteError('/api/portfolio/ingest', 'connect', error);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line.includes('\n')).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      route: '/api/portfolio/ingest',
      stage: 'connect',
      errorType: 'Error',
      message: 'connect failed',
      code: 'ECONNRESET',
    });
    expect(typeof parsed.stack).toBe('string');
  });

  it('不把连接串写进 message', () => {
    const fields = extractWriteErrorFields(
      new Error('connect postgresql://user:pass@host/db failed')
    );
    expect(fields.message).toBe('connect [redacted] failed');
    expect(fields.message).not.toContain('postgresql://');
  });
});
