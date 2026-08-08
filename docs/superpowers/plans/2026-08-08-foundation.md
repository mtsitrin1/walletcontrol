# walletcontrol Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, self-hosted, single-user expense tracker with manual transaction entry, category management, a dashboard (transaction list + category breakdown), and password auth — deployable via Docker Compose. No bank scraping and no AI categorization yet (separate follow-on plans); this plan produces a usable app on its own.

**Architecture:** Next.js (App Router, TypeScript) talking directly to Postgres via `pg` — no ORM. A hand-rolled SQL migration runner (no migration framework). Single shared password gates the app via a signed session cookie (`iron-session`), enforced in `middleware.ts`. One Docker Compose stack: `app` + `db`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Node 22+, `pg`, `bcryptjs`, `iron-session`, Postgres 16, Docker Compose. Tests via Node's built-in `node:test` run with `--experimental-strip-types` (no test framework dependency).

## Global Constraints

- Node 22+ required (uses `--experimental-strip-types` to run `.ts` tests without a compiler).
- ESM throughout (`"type": "module"` in package.json).
- No ORM — raw SQL via `pg`, migrations are plain `.sql` files applied by a custom runner.
- No test framework dependency — `node:test` + `node:assert/strict` only.
- Auth is a single shared password (bcrypt hash from `APP_PASSWORD_HASH` env var) + `iron-session` cookie — no user table, no OAuth.
- All routes except `/login` and `POST /api/auth/login` require an authenticated session (enforced in `middleware.ts`).
- `account_id` on `transactions` is a plain nullable integer with no FK yet — the `accounts` table and its FK are added by the bank-scraping plan.

---

### Task 1: Project scaffold & Docker Compose

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.dockerignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: an empty Next.js app that boots on port 3000, and a `docker-compose.yml` with services `db` (Postgres 16) and `app`, both later tasks will extend.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm
```

When prompted about a non-empty directory (git repo present), confirm to proceed in the current directory.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install pg bcryptjs iron-session
npm install -D @types/pg
```

- [ ] **Step 3: Set module type to ESM**

Edit `package.json`, add top-level field:

```json
"type": "module"
```

Add a `test` script:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "migrate": "node db/migrate.mjs",
  "test": "node --experimental-strip-types --test tests/**/*.test.ts"
}
```

- [ ] **Step 4: Add a path alias for `db/`**

`create-next-app --import-alias "@/*"` only maps `@/*` to `./src/*`, which can't reach the root-level `db/` directory. Edit `tsconfig.json`'s `compilerOptions.paths` to add a second alias:

```json
"paths": {
  "@/*": ["./src/*"],
  "@db/*": ["./db/*"]
}
```

- [ ] **Step 5: Write `.env.example`**

```
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgres://walletcontrol:change-me@localhost:5432/walletcontrol
SESSION_SECRET=change-me-to-a-random-32-plus-character-string
APP_PASSWORD_HASH=
```

- [ ] **Step 6: Write `Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "node db/migrate.mjs && npm start"]
```

- [ ] **Step 7: Write `.dockerignore`**

```
node_modules
.next
.git
.env
```

- [ ] **Step 8: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: walletcontrol
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: walletcontrol
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  app:
    build: .
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://walletcontrol:${POSTGRES_PASSWORD}@db:5432/walletcontrol
      SESSION_SECRET: ${SESSION_SECRET}
      APP_PASSWORD_HASH: ${APP_PASSWORD_HASH}
    ports:
      - "3000:3000"
volumes:
  db_data:
```

- [ ] **Step 9: Verify the app boots**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Expected: `200`. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app and Docker Compose stack"
```

---

### Task 2: Migration runner & initial schema

**Files:**
- Create: `db/migrations/001_init.sql`
- Create: `db/migrate.mjs`
- Create: `tests/migrate.test.ts`

**Interfaces:**
- Produces: `pendingMigrations(allFiles: string[], applied: string[]): string[]` (exported from `db/migrate.mjs`), and a `migrations` tracking table plus `categories`/`transactions` tables in Postgres once run.

- [ ] **Step 1: Write the failing test for migration ordering**

```ts
// tests/migrate.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `db/migrate.mjs` does not exist yet.

- [ ] **Step 3: Write the migration runner**

```js
// db/migrate.mjs
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS (all 3 cases).

- [ ] **Step 5: Write the initial schema migration**

```sql
-- db/migrations/001_init.sql
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  merchant TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  source TEXT NOT NULL CHECK (source IN ('scraped', 'manual')),
  dedup_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (name) VALUES
  ('Groceries'), ('Dining'), ('Transport'), ('Utilities'),
  ('Shopping'), ('Entertainment'), ('Health'), ('Housing'), ('Other')
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 6: Verify against a real Postgres instance**

```bash
docker compose up -d db
export DATABASE_URL=postgres://walletcontrol:change-me@localhost:5432/walletcontrol
npm run migrate
npm run migrate  # second run must be a no-op
```

Expected: first run logs "Applying 001_init.sql" and "Applied 1 migration(s)."; second run logs "Applied 0 migration(s)."

- [ ] **Step 7: Commit**

```bash
git add db tests/migrate.test.ts package.json
git commit -m "feat: add migration runner and initial schema"
```

---

### Task 3: Auth (session, login, logout, middleware)

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `APP_PASSWORD_HASH`, `SESSION_SECRET` env vars.
- Produces: `SessionData` type `{ authenticated?: boolean }` (exported from `src/lib/session.ts`), used by later API routes indirectly via `middleware.ts` (they don't need to check auth themselves — unauthenticated requests never reach them).

- [ ] **Step 1: Write the session config/types**

```ts
// src/lib/session.ts
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  authenticated?: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'walletcontrol_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
```

- [ ] **Step 2: Write the login route**

```ts
// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = body?.password;
  const hash = process.env.APP_PASSWORD_HASH ?? '';

  const valid = typeof password === 'string' && hash !== '' && (await bcrypt.compare(password, hash));
  if (!valid) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.authenticated = true;
  await session.save();
  return res;
}
```

- [ ] **Step 3: Write the logout route**

```ts
// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.destroy();
  return res;
}
```

- [ ] **Step 4: Write the auth middleware**

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login']);

export async function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.authenticated) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 5: Generate a real password hash and verify manually**

```bash
node -e "import('bcryptjs').then(b => b.default.hash('testpassword', 10)).then(console.log)"
```

Put the printed hash in a local `.env` as `APP_PASSWORD_HASH`, set `SESSION_SECRET` to any 32+ char string, then:

```bash
npm run dev &
curl -i -s http://localhost:3000/ | head -1                     # expect 307 redirect to /login
curl -i -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}' | head -1                            # expect 401
curl -i -s -c /tmp/wc-cookie -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"testpassword"}' | head -1                     # expect 200
curl -i -s -b /tmp/wc-cookie http://localhost:3000/ | head -1    # expect 200
```

No automated test for this task — it's thin wiring around `bcryptjs`/`iron-session`, not custom logic.

- [ ] **Step 6: Commit**

```bash
git add src/lib/session.ts src/app/api/auth middleware.ts
git commit -m "feat: add password auth with iron-session"
```

---

### Task 4: DB client & categories API

**Files:**
- Create: `db/client.ts`
- Create: `src/app/api/categories/route.ts`

**Interfaces:**
- Produces: `pool: pg.Pool` (exported from `db/client.ts`), `GET /api/categories` → `{id, name, parent_id}[]`, `POST /api/categories` → created row.

- [ ] **Step 1: Write the DB client singleton**

```ts
// db/client.ts
import pg from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var pgPool: pg.Pool | undefined;
}

export const pool = globalThis.pgPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') {
  globalThis.pgPool = pool;
}
```

- [ ] **Step 2: Write the categories API route**

```ts
// src/app/api/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@db/client';

export async function GET() {
  const { rows } = await pool.query('SELECT id, name, parent_id FROM categories ORDER BY name');
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    'INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id',
    [body.name.trim(), body.parent_id ?? null],
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Verify manually against the running dev server + db**

```bash
curl -s -b /tmp/wc-cookie http://localhost:3000/api/categories | head -c 200
curl -s -b /tmp/wc-cookie -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" -d '{"name":"Travel"}'
```

Expected: first call lists the 9 seeded categories; second returns the new `Travel` row with status 201.

No automated test — this is a thin CRUD wrapper with no branching logic beyond the one validation check, which is covered by manual verification.

- [ ] **Step 4: Commit**

```bash
git add db/client.ts src/app/api/categories
git commit -m "feat: add db client and categories API"
```

---

### Task 5: Manual transaction validation & transactions API

**Files:**
- Create: `src/lib/validateTransaction.ts`
- Create: `tests/validateTransaction.test.ts`
- Create: `src/app/api/transactions/route.ts`
- Create: `src/app/api/transactions/[id]/route.ts`

**Interfaces:**
- Produces: `validateManualTransaction(input): {valid: boolean, errors: string[]}` (exported from `src/lib/validateTransaction.ts`).
- Produces: `GET /api/transactions?month=YYYY-MM` → transaction rows joined with category name; `POST /api/transactions` → created row; `PATCH /api/transactions/:id` (body `{category_id}`) → updated row.

- [ ] **Step 1: Write the failing validation tests**

```ts
// tests/validateTransaction.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `src/lib/validateTransaction.ts` does not exist.

- [ ] **Step 3: Write the validation function**

```ts
// src/lib/validateTransaction.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS (all 7 cases).

- [ ] **Step 5: Write the transactions list/create route**

```ts
// src/app/api/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@db/client';
import { validateManualTransaction } from '@/lib/validateTransaction';

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month'); // 'YYYY-MM'
  const categoryId = req.nextUrl.searchParams.get('category_id');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (month) {
    params.push(`${month}-01`);
    conditions.push(`date_trunc('month', t.date) = $${params.length}::date`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    conditions.push(`t.category_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT t.id, t.date, t.amount, t.currency, t.merchant, t.category_id,
            c.name AS category_name, t.source
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     ${where}
     ORDER BY t.date DESC, t.id DESC`,
    params,
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { valid, errors } = validateManualTransaction(body ?? {});
  if (!valid) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const { rows } = await pool.query(
    `INSERT INTO transactions (date, amount, merchant, category_id, source)
     VALUES ($1, $2, $3, $4, 'manual')
     RETURNING id, date, amount, currency, merchant, category_id, source`,
    [body.date, body.amount, body.merchant.trim(), body.category_id ?? null],
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 6: Write the transaction category-edit route**

```ts
// src/app/api/transactions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@db/client';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (body?.category_id !== null && typeof body?.category_id !== 'number') {
    return NextResponse.json({ error: 'category_id must be a number or null' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `UPDATE transactions SET category_id = $1 WHERE id = $2
     RETURNING id, date, amount, currency, merchant, category_id, source`,
    [body.category_id, Number(id)],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
```

- [ ] **Step 7: Verify manually**

```bash
curl -s -b /tmp/wc-cookie -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-01","amount":-55.2,"merchant":"Shufersal","category_id":1}'
curl -s -b /tmp/wc-cookie "http://localhost:3000/api/transactions?month=2026-08"
```

Expected: create returns 201 with the row; list returns an array containing it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validateTransaction.ts tests/validateTransaction.test.ts src/app/api/transactions
git commit -m "feat: add manual transaction validation and transactions API"
```

---

### Task 6: Category breakdown

**Files:**
- Create: `src/lib/categoryBreakdown.ts`
- Create: `tests/categoryBreakdown.test.ts`
- Create: `src/app/api/breakdown/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks besides the `categories`/`transactions` schema shape.
- Produces: `computeCategoryBreakdown(transactions: TransactionForBreakdown[]): CategoryBreakdownRow[]` (exported from `src/lib/categoryBreakdown.ts`); `GET /api/breakdown?month=YYYY-MM` → `CategoryBreakdownRow[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/categoryBreakdown.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `src/lib/categoryBreakdown.ts` does not exist.

- [ ] **Step 3: Write the pure breakdown function**

```ts
// src/lib/categoryBreakdown.ts
export interface TransactionForBreakdown {
  amount: number;
  category_id: number | null;
  category_name: string | null;
}

export interface CategoryBreakdownRow {
  category_id: number | null;
  category_name: string;
  total: number;
}

export function computeCategoryBreakdown(
  transactions: TransactionForBreakdown[],
): CategoryBreakdownRow[] {
  const totals = new Map<string, CategoryBreakdownRow>();

  for (const t of transactions) {
    const key = t.category_id === null ? 'uncategorized' : String(t.category_id);
    const name = t.category_name ?? 'Uncategorized';
    const existing = totals.get(key);
    if (existing) {
      existing.total += t.amount;
    } else {
      totals.set(key, { category_id: t.category_id, category_name: name, total: t.amount });
    }
  }

  return [...totals.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS (all 4 cases).

- [ ] **Step 5: Wire the breakdown API route**

```ts
// src/app/api/breakdown/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@db/client';
import { computeCategoryBreakdown } from '@/lib/categoryBreakdown';

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month');
  if (!month) {
    return NextResponse.json({ error: 'month query param (YYYY-MM) is required' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT t.amount, t.category_id, c.name AS category_name
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE date_trunc('month', t.date) = $1::date`,
    [`${month}-01`],
  );

  return NextResponse.json(computeCategoryBreakdown(rows));
}
```

- [ ] **Step 6: Verify manually**

```bash
curl -s -b /tmp/wc-cookie "http://localhost:3000/api/breakdown?month=2026-08"
```

Expected: an array with the `Groceries` total from the transaction created in Task 5.

- [ ] **Step 7: Commit**

```bash
git add src/lib/categoryBreakdown.ts tests/categoryBreakdown.test.ts src/app/api/breakdown
git commit -m "feat: add category breakdown"
```

---

### Task 7: Login page UI

**Files:**
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` from Task 3.

- [ ] **Step 1: Write the login page**

```tsx
// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Incorrect password');
      return;
    }
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>walletcontrol</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>
          Log in
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually in a browser**

```bash
npm run dev
```

Open `http://localhost:3000/login`, submit the wrong password (see error), submit the right one (redirected to `/`).

- [ ] **Step 3: Commit**

```bash
git add src/app/login
git commit -m "feat: add login page"
```

---

### Task 8: Dashboard UI (transaction list, manual entry, breakdown)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/transactions`, `PATCH /api/transactions/:id`, `GET/POST /api/categories`, `GET /api/breakdown` from Tasks 4–6.

- [ ] **Step 1: Write the dashboard page**

```tsx
// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';

interface Category {
  id: number;
  name: string;
}

interface Transaction {
  id: number;
  date: string;
  amount: string;
  merchant: string;
  category_id: number | null;
  category_name: string | null;
}

interface BreakdownRow {
  category_id: number | null;
  category_name: string;
  total: number;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [form, setForm] = useState({ date: '', amount: '', merchant: '', category_id: '' });

  async function loadAll() {
    const [catsRes, txRes, breakdownRes] = await Promise.all([
      fetch('/api/categories'),
      fetch(`/api/transactions?month=${month}`),
      fetch(`/api/breakdown?month=${month}`),
    ]);
    setCategories(await catsRes.json());
    setTransactions(await txRes.json());
    setBreakdown(await breakdownRes.json());
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        amount: Number(form.amount),
        merchant: form.merchant,
        category_id: form.category_id ? Number(form.category_id) : null,
      }),
    });
    setForm({ date: '', amount: '', merchant: '', category_id: '' });
    loadAll();
  }

  async function handleCategoryChange(id: number, category_id: string) {
    await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: category_id ? Number(category_id) : null }),
    });
    loadAll();
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>walletcontrol</h1>

      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

      <h2>Add transaction</h2>
      <form onSubmit={handleAddTransaction} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          required
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          type="text"
          placeholder="Merchant"
          required
          value={form.merchant}
          onChange={(e) => setForm({ ...form, merchant: e.target.value })}
        />
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit">Add</button>
      </form>

      <h2>Category breakdown</h2>
      <ul>
        {breakdown.map((row) => (
          <li key={row.category_id ?? 'uncategorized'}>
            {row.category_name}: {row.total.toFixed(2)}
          </li>
        ))}
      </ul>

      <h2>Transactions</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.merchant}</td>
              <td>{t.amount}</td>
              <td>
                <select
                  value={t.category_id ?? ''}
                  onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually in a browser**

```bash
npm run dev
```

Open `http://localhost:3000`, log in, add a transaction, confirm it appears in the table and the breakdown updates, then change its category via the dropdown and confirm the breakdown re-totals.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add dashboard with transaction list, manual entry, and breakdown"
```

---

### Task 9: End-to-end Docker verification

**Files:** none (verification only)

- [ ] **Step 1: Build and run the full stack**

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, SESSION_SECRET, and APP_PASSWORD_HASH
# (generate the hash the same way as Task 3 Step 5)
docker compose up --build -d
```

- [ ] **Step 2: Verify the app is reachable and migrations ran**

```bash
sleep 5
curl -i -s http://localhost:3000/ | head -1   # expect redirect to /login
docker compose logs app | grep -i "Applied"   # expect "Applied 1 migration(s)."
```

- [ ] **Step 3: Verify login and a full manual-entry flow through the browser**

Open `http://localhost:3000`, log in with the password you hashed into `APP_PASSWORD_HASH`, add a transaction, confirm it shows in the list and in the breakdown.

- [ ] **Step 4: Tear down**

```bash
docker compose down
```

- [ ] **Step 5: Commit (only if any fixes were needed)**

```bash
git add -A
git commit -m "fix: docker compose end-to-end issues"
```
