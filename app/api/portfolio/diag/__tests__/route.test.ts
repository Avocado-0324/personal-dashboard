import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const authMock = jest.fn(async (): Promise<{ user?: { email?: string } } | null> => null);

jest.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

jest.mock('@/db/diag', () => ({
  probeHttpSelect1: jest.fn(),
  probeWsPoolConnect: jest.fn(),
  probeWsEmptyTransaction: jest.fn(),
}));

import { GET } from '../route';

describe('GET /api/portfolio/diag', () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    delete process.env.PORTFOLIO_INGEST_KEY;
  });

  it('未登录且无 ingest key 时返回 401', async () => {
    const response = await GET(new Request('https://dashboard.example.test/api/portfolio/diag') as never);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: '未授权' });
  });

  it('错误 ingest key 返回 401', async () => {
    process.env.PORTFOLIO_INGEST_KEY = 'a'.repeat(32);
    const response = await GET(
      new Request('https://dashboard.example.test/api/portfolio/diag', {
        headers: { authorization: 'Bearer ' + 'b'.repeat(32) },
      }) as never
    );
    expect(response.status).toBe(401);
  });
});
