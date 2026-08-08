import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingMigrations } from '../db/migrate.mjs';

test('returns unapplied files sorted ascending', () => {
  const result = pendingMigrations(
    ['002_add_x.sql', '001_init.sql', '003_add_y.sql'],
    ['001_init.sql'],
  );
  assert.deepEqual(result, ['002_add_x.sql', '003_add_y.sql']);
});

test('returns empty array when all files are applied', () => {
  const result = pendingMigrations(['001_init.sql'], ['001_init.sql']);
  assert.deepEqual(result, []);
});

test('returns all files when none are applied', () => {
  const result = pendingMigrations(['002_add_x.sql', '001_init.sql'], []);
  assert.deepEqual(result, ['001_init.sql', '002_add_x.sql']);
});
