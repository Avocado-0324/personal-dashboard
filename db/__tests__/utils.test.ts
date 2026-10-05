import { describe, it, expect } from '@jest/globals';
import { isUniqueViolation } from '@/db/utils';

describe('isUniqueViolation', () => {
  const CONSTRAINT_NAME = 'import_batches_idempotency_key_unique_not_reverted';

  it('should return true for direct error with matching code and constraint', () => {
    const error = {
      code: '23505',
      constraint: CONSTRAINT_NAME,
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(true);
  });

  it('should return true for error with code and constraint in cause', () => {
    const error = {
      message: 'Transaction failed',
      cause: {
        code: '23505',
        constraint: CONSTRAINT_NAME,
      },
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(true);
  });

  it('should return true when constraint is in constraint_name property', () => {
    const error = {
      code: '23505',
      constraint_name: CONSTRAINT_NAME,
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(true);
  });

  it('should return true when constraint_name is in cause', () => {
    const error = {
      message: 'Transaction failed',
      cause: {
        code: '23505',
        constraint_name: CONSTRAINT_NAME,
      },
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(true);
  });

  it('should return false for non-unique violation error code', () => {
    const error = {
      code: '23503',
      constraint: CONSTRAINT_NAME,
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(false);
  });

  it('should return false for different constraint name', () => {
    const error = {
      code: '23505',
      constraint: 'some_other_constraint',
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(false);
  });

  it('should return false when neither error nor cause match', () => {
    const error = {
      code: '23503',
      constraint: 'other_constraint',
      cause: {
        code: '23503',
        constraint: 'another_constraint',
      },
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(false);
  });

  it('should return false for null or undefined error', () => {
    expect(isUniqueViolation(null, CONSTRAINT_NAME)).toBe(false);
    expect(isUniqueViolation(undefined, CONSTRAINT_NAME)).toBe(false);
  });

  it('should return false for error without code', () => {
    const error = {
      constraint: CONSTRAINT_NAME,
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(false);
  });

  it('should return false for error without constraint', () => {
    const error = {
      code: '23505',
    };
    expect(isUniqueViolation(error, CONSTRAINT_NAME)).toBe(false);
  });
});
