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
