// GET /api/auth/google/callback — completes Google Sign-In. Verifies the CSRF
// state, exchanges the code for the id_token, upserts the user, issues a session
// JWT (the `session` cookie), and redirects back to /signin. Mirrors the audited
// analytics callback's CSRF handling (strict in prod, lenient only in local dev).
//
// Stage 1: this only ESTABLISHES identity. No data is filtered by the session yet.

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForIdentity } from '@/lib/google/oauth-login';
import { upsertUser } from '@/lib/users-store';
import { createSessionToken } from '@/lib/auth';

function redirectTo(req: NextRequest, target: string): NextResponse {
  return NextResponse.redirect(new URL(target, req.url));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) return redirectTo(req, `/signin?error=${encodeURIComponent(oauthError)}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get('login_oauth_state')?.value;
  // Strict CSRF match everywhere except explicit local dev (the state cookie is
  // easily lost across Google's cross-site redirect locally). Fail closed otherwise.
  const isDev = process.env.NODE_ENV === 'development';
  const stateOk = isDev ? true : Boolean(state && expectedState && state === expectedState);
  if (!code || !stateOk) {
    const res = redirectTo(req, '/signin?error=invalid_state');
    res.cookies.set('login_oauth_state', '', { maxAge: 0, path: '/' });
    return res;
  }

  let res: NextResponse;
  try {
    const identity = await exchangeCodeForIdentity(code);
    const user = await upsertUser({ id: identity.sub, email: identity.email ?? null, name: identity.name ?? null });
    const token = await createSessionToken({ user_id: user.id, email: user.email ?? undefined, role: 'user' });
    res = redirectTo(req, '/signin?signedin=1');
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  } catch (e) {
    console.error('[auth/google/callback] sign-in failed:', (e as Error)?.message);
    res = redirectTo(req, `/signin?error=${encodeURIComponent((e as Error)?.message?.slice(0, 120) || 'signin_failed')}`);
  }
  res.cookies.set('login_oauth_state', '', { maxAge: 0, path: '/' });
  return res;
}
