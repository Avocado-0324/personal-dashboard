function hasPgCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: unknown }).code === code;
}

/**
 * PostgreSQL unique_violation，只认错误码 23505（含 cause），不比对约束名。
 * 生产库约束名可能是自动生成的 `…_instrument_id_key`，与 schema.ts 不一致。
 */
export function isPgUniqueViolation(err: unknown): boolean {
  if (hasPgCode(err, '23505')) return true;
  if (err && typeof err === 'object' && 'cause' in err) {
    return hasPgCode((err as { cause: unknown }).cause, '23505');
  }
  return false;
}

/**
 * Check if an error is a unique constraint violation.
 * 
 * Drizzle wraps PostgreSQL errors in a `cause` property, so we need to check both
 * the error itself and its cause for the constraint violation code (23505).
 * 
 * @param err - The error to check
 * @param constraintName - The exact constraint name to match (e.g., 'import_batches_idempotency_key_status_idx')
 * @returns true if the error is a unique violation for the specified constraint
 */
export function isUniqueViolation(err: any, constraintName: string): boolean {
  if (!err) return false;
  
  const checkError = (e: any): boolean => {
    if (!e) return false;
    
    const code = e.code;
    const constraint = e.constraint || e.constraint_name;
    
    return code === '23505' && constraint === constraintName;
  };
  
  return checkError(err) || checkError(err.cause);
}
