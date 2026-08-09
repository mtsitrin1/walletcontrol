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
