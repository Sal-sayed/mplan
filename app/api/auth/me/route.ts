// GET /api/auth/me — the current signed-in user (from the session cookie), or null.
// Read-only identity echo; performs NO authorization.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  // Identity is per-session — NEVER cache it. HTTP caches key on URL, not the
  // session cookie, so without this the browser/proxy can serve a PREVIOUS
  // account's identity after the user switches Google accounts.
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
