import { describe, expect, it, jest } from '@jest/globals';
import {
  CSV_IMPORT_SERVER_FAILURE_MESSAGE,
  submitCsvImport,
} from '../csv-import-client';

const FILE = new Blob(['symbol,qty'], { type: 'text/csv' });

describe('submitCsvImport', () => {
  it('模拟 500 时进入失败态，文案固定且不暴露 500/英文报错', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error', details: 'ECONNRESET' }),
    }));

    const result = await submitCsvImport({
      file: FILE,
      asOf: '2026-10-12',
      fetchImpl,
    });

    expect(result).toEqual({
      status: 'server-failure',
      message: '导入失败，没有写入任何数据，请稍后重试',
    });
    expect(result.status).toBe('server-failure');
    if (result.status === 'server-failure') {
      expect(result.message).toBe(CSV_IMPORT_SERVER_FAILURE_MESSAGE);
    }
    expect(JSON.stringify(result)).not.toMatch(/500|Internal server error|ECONNRESET/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('网络失败时同样进入失败态', async () => {
    const result = await submitCsvImport({
      file: FILE,
      asOf: '2026-10-12',
      fetchImpl: async () => {
        throw new Error('Failed to fetch');
      },
    });

    expect(result).toEqual({
      status: 'server-failure',
      message: CSV_IMPORT_SERVER_FAILURE_MESSAGE,
    });
  });

  it('4xx 校验错误不走服务端失败态', async () => {
    const result = await submitCsvImport({
      file: FILE,
      asOf: '2026-10-12',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ errors: [{ row: 2, message: '数量无效' }] }),
      }),
    });

    expect(result).toEqual({
      status: 'client-error',
      errors: [{ row: 2, message: '数量无效' }],
    });
  });
});
