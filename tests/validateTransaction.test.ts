import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManualTransaction } from '../src/lib/validateTransaction.ts';

test('accepts a valid transaction', () => {
  const result = validateManualTransaction({
    date: '2026-08-01',
    amount: -42.5,
    merchant: 'Shufersal',
    category_id: 1,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects a missing/invalid date', () => {
  const result = validateManualTransaction({ date: 'not-a-date', amount: -10, merchant: 'X' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('date')));
});

test('rejects a zero amount', () => {
  const result = validateManualTransaction({ date: '2026-08-01', amount: 0, merchant: 'X' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('amount')));
});

test('rejects a non-numeric amount', () => {
  const result = validateManualTransaction({ date: '2026-08-01', amount: '10', merchant: 'X' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('amount')));
});

test('rejects a blank merchant', () => {
  const result = validateManualTransaction({ date: '2026-08-01', amount: -10, merchant: '  ' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('merchant')));
});

test('rejects a non-numeric category_id when provided', () => {
  const result = validateManualTransaction({
    date: '2026-08-01',
    amount: -10,
    merchant: 'X',
    category_id: 'groceries',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('category_id')));
});

test('allows a missing category_id', () => {
  const result = validateManualTransaction({ date: '2026-08-01', amount: -10, merchant: 'X' });
  assert.equal(result.valid, true);
});
