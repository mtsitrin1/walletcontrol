import pg from 'pg';

pg.types.setTypeParser(1082, (val) => val); // DATE oid — return raw 'YYYY-MM-DD' string, avoid local-timezone Date parsing

declare global {
  // eslint-disable-next-line no-var
  var pgPool: pg.Pool | undefined;
}

export const pool = globalThis.pgPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') {
  globalThis.pgPool = pool;
}
