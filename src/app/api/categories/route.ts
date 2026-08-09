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
