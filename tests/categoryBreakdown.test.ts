import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCategoryBreakdown } from '../src/lib/categoryBreakdown.ts';

test('sums amounts per category', () => {
  const result = computeCategoryBreakdown([
    { amount: -10, category_id: 1, category_name: 'Groceries' },
    { amount: -5, category_id: 1, category_name: 'Groceries' },
    { amount: -20, category_id: 2, category_name: 'Dining' },
  ]);
  assert.deepEqual(result, [
    { category_id: 2, category_name: 'Dining', total: -20 },
    { category_id: 1, category_name: 'Groceries', total: -15 },
  ]);
});

test('buckets null category_id as Uncategorized', () => {
  const result = computeCategoryBreakdown([
    { amount: -10, category_id: null, category_name: null },
  ]);
  assert.deepEqual(result, [{ category_id: null, category_name: 'Uncategorized', total: -10 }]);
});

test('returns empty array for no transactions', () => {
  assert.deepEqual(computeCategoryBreakdown([]), []);
});

test('sorts descending by total magnitude', () => {
  const result = computeCategoryBreakdown([
    { amount: -5, category_id: 1, category_name: 'A' },
    { amount: -50, category_id: 2, category_name: 'B' },
  ]);
  assert.deepEqual(result.map((r) => r.category_name), ['B', 'A']);
});
