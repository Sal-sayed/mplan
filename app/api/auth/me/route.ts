// GET /api/auth/me — the current signed-in user (from the session cookie), or null.
// Read-only identity echo; performs NO authorization.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  return NextResponse.json({ user });
}
