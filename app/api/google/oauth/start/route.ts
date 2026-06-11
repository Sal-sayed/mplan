// GET /api/google/oauth/start — admin-only. Sets a CSRF `state` cookie and
// redirects to Google's consent screen. Opened in a popup by the readiness modal
// so the in-progress plan isn't lost.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isOperatorRequest } from '@/lib/auth';
import { buildAuthUrl, isOAuthConfigured } from '@/lib/google/oauth';

export async function GET(req: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'Google OAuth is not configured on the server.' }, { status: 500 });
  }
  if (!(await isOperatorRequest(req))) {
    return NextResponse.json({ error: 'Sign in as admin (at /leads) before connecting Google.' }, { status: 401 });
  }

  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
