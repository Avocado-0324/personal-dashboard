export type WriteErrorStage = 'parse' | 'connect' | 'transaction' | 'other';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickCode(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return undefined;
}

export function redactInternalText(text: string): string {
  return text
    .replace(/(?:postgres(?:ql)?|https?|wss?):\/\/[^\s'"]+/gi, '[redacted]')
    .replace(/\b(password|secret|api[_-]?key|token|authorization)=[^\s&'"]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

export function extractWriteErrorFields(error: unknown): {
  errorType: string;
  message: string;
  code?: string | number;
  stack?: string;
} {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; cause?: unknown };
    const cause = asRecord(record.cause);
    return {
      errorType: error.name || 'Error',
      message: redactInternalText(error.message),
      code: pickCode(record.code) ?? pickCode(cause?.code),
      stack: error.stack ? redactInternalText(error.stack) : undefined,
    };
  }

  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const cause = asRecord(record.cause);
    return {
      errorType: typeof record.name === 'string' ? record.name : 'Error',
      message: redactInternalText(typeof record.message === 'string' ? record.message : 'Unknown error'),
      code: pickCode(record.code) ?? pickCode(cause?.code),
      stack: typeof record.stack === 'string' ? redactInternalText(record.stack) : undefined,
    };
  }

  return {
    errorType: typeof error,
    message: redactInternalText(String(error)),
  };
}

export function logWriteError(route: string, stage: WriteErrorStage, error: unknown): void {
  const fields = extractWriteErrorFields(error);
  console.error(
    JSON.stringify({
      route,
      stage,
      errorType: fields.errorType,
      message: fields.message,
      code: fields.code,
      stack: fields.stack,
    })
  );
}
