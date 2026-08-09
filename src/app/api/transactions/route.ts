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
