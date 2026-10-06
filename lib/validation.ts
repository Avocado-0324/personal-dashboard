export const FX_RATE_RE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/;
export const CURRENCY_RE = /^[A-Z]{3}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_RE.test(value);
}

export function isFxRateString(value: unknown): value is string {
  return typeof value === 'string' && FX_RATE_RE.test(value);
}
