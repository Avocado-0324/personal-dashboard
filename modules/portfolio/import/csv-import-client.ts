export const CSV_IMPORT_SERVER_FAILURE_MESSAGE =
  '导入失败，没有写入任何数据，请稍后重试';

export type CsvImportClientError = {
  row?: number;
  message?: string;
};

export type CsvImportOutcome =
  | {
      status: 'ok';
      imported: number;
      alreadyImported?: boolean;
      message?: string;
      batchId?: string;
    }
  | {
      status: 'client-error';
      errors: CsvImportClientError[];
    }
  | {
      status: 'server-failure';
      message: typeof CSV_IMPORT_SERVER_FAILURE_MESSAGE;
    };

type FetchLike = (
  input: string,
  init?: { method?: string; body?: FormData }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export async function submitCsvImport(options: {
  file: Blob;
  asOf: string;
  fetchImpl?: FetchLike;
}): Promise<CsvImportOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const formData = new FormData();
  formData.append('file', options.file);
  formData.append('asOf', options.asOf);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl('/api/portfolio/import/csv', {
      method: 'POST',
      body: formData,
    });
  } catch {
    return {
      status: 'server-failure',
      message: CSV_IMPORT_SERVER_FAILURE_MESSAGE,
    };
  }

  if (response.status >= 500) {
    return {
      status: 'server-failure',
      message: CSV_IMPORT_SERVER_FAILURE_MESSAGE,
    };
  }

  let json: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === 'object') {
      json = parsed as Record<string, unknown>;
    }
  } catch {
    json = {};
  }

  if (!response.ok) {
    const errors = Array.isArray(json.errors)
      ? (json.errors as CsvImportClientError[])
      : [{ row: 0, message: typeof json.error === 'string' ? json.error : '导入失败' }];
    return { status: 'client-error', errors };
  }

  return {
    status: 'ok',
    imported: typeof json.imported === 'number' ? json.imported : 0,
    alreadyImported: json.alreadyImported === true,
    message: typeof json.message === 'string' ? json.message : undefined,
    batchId: typeof json.batchId === 'string' ? json.batchId : undefined,
  };
}
