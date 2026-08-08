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
