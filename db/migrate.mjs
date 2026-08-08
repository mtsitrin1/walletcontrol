import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function pendingMigrations(allFiles, applied) {
  const appliedSet = new Set(applied);
  return allFiles.filter((f) => !appliedSet.has(f)).sort();
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  const { rows } = await client.query('SELECT name FROM migrations');
  const applied = rows.map((r) => r.name);

  const dir = path.join(__dirname, 'migrations');
  const allFiles = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const pending = pendingMigrations(allFiles, applied);

  for (const file of pending) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    console.log(`Applying ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  await client.end();
  console.log(`Applied ${pending.length} migration(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
