// GET /api/google/oauth/start-write — Phase B "Connect for write" (SEPARATE
// consent). Requests tagmanager.edit.containers (plus the existing read scopes via
// include_granted_scopes) so the user can auto-create a GTM workspace. Reuses the
// existing /api/google/oauth/callback, which saves the upgraded token. Does NOT
// request tagmanager.publish — Phase B never publishes.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { resolveConnectOwnerId } from '@/lib/auth';
import { buildWriteAuthUrl, isOAuthConfigured } from '@/lib/google/oauth';

export async function GET(req: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'Google OAuth is not configured on the server.' }, { status: 500 });
  }
  // Only a signed-in user (or admin) connects/upgrades their OWN Google grant.
  if (!(await resolveConnectOwnerId(req))) {
    return NextResponse.json({ error: 'Sign in before connecting Google for write.' }, { status: 401 });
  }
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(buildWriteAuthUrl(state));
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
