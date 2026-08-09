export interface ManualTransactionInput {
  date?: unknown;
  amount?: unknown;
  merchant?: unknown;
  category_id?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManualTransaction(input: ManualTransactionInput): ValidationResult {
  const errors: string[] = [];

  if (typeof input.date !== 'string' || Number.isNaN(Date.parse(input.date))) {
    errors.push('date must be a valid ISO date string');
  }
  if (typeof input.amount !== 'number' || Number.isNaN(input.amount) || input.amount === 0) {
    errors.push('amount must be a non-zero number');
  }
  if (typeof input.merchant !== 'string' || input.merchant.trim() === '') {
    errors.push('merchant is required');
  }
  if (
    input.category_id !== undefined &&
    input.category_id !== null &&
    typeof input.category_id !== 'number'
  ) {
    errors.push('category_id must be a number if provided');
  }

  return { valid: errors.length === 0, errors };
}
