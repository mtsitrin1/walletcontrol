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
