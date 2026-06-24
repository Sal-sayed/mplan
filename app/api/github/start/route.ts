// GET /api/github/start — signed-in users only. Sets a CSRF `state` cookie and
// redirects to GitHub's consent screen. Opened in a popup by the connect UI so the
// in-progress plan isn't lost. Mirrors /api/google/oauth/start.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { resolveConnectOwnerId } from '@/lib/auth';
import { buildAuthUrl, isConfigured } from '@/lib/github/oauth';

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'GitHub OAuth is not configured on the server.' }, { status: 500 });
  }
  // A signed-in user (or the admin) connects their OWN GitHub. An anonymous
  // non-admin caller can't — they'd hijack the shared 'admin' connection.
  if (!(await resolveConnectOwnerId(req))) {
    return NextResponse.json({ error: 'Sign in before connecting GitHub.' }, { status: 401 });
  }

  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set('gh_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
