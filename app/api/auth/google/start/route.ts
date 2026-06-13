// GET /api/auth/google/start — begin Google Sign-In (identity). NOT gated (this
// is how anyone signs in). Sets a CSRF `state` cookie and redirects to Google's
// consent screen for openid/email/profile. Separate from the analytics OAuth.

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { buildLoginAuthUrl, isLoginConfigured } from '@/lib/google/oauth-login';

export async function GET() {
  if (!isLoginConfigured()) {
    return NextResponse.json({ error: 'Google Sign-In is not configured on the server.' }, { status: 500 });
  }
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(buildLoginAuthUrl(state));
  res.cookies.set('login_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
