// GET /api/google/oauth/callback — admin-only. Verifies the CSRF state, exchanges
// the auth code for tokens, stores them, then returns a tiny HTML page that posts
// the result to the opener window (popup flow) and closes itself.

import { NextRequest, NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/auth';
import { exchangeCodeForTokens } from '@/lib/google/oauth';
import { saveTokens } from '@/lib/google/token-store';

function popupResult(status: 'connected' | 'error', message?: string): NextResponse {
  const note = status === 'connected'
    ? 'Google connected. You can close this window.'
    : 'Google connection failed. You can close this window.';
  const payload = JSON.stringify({ source: 'google-oauth', status, ...(message ? { message } : {}) });
  const html = `<!doctype html><html><body style="font:14px system-ui;padding:24px;background:#0b1120;color:#cbd5e1">
<script>
  (function () {
    try { if (window.opener) window.opener.postMessage(${payload}, window.location.origin); } catch (e) {}
    setTimeout(function () { window.close(); }, 300);
  })();
</script>
${note}
</body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  if (!(await isOperatorRequest(req))) {
    console.warn('[google/oauth/callback] rejected — request is not signed in as admin');
    return popupResult('error', 'Not signed in as admin.');
  }

  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.warn('[google/oauth/callback] Google returned error:', oauthError);
    return popupResult('error', oauthError);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get('g_oauth_state')?.value;
  // Strict CSRF state match everywhere EXCEPT explicit local development (where
  // the state cookie is easily lost across Google's cross-site redirect — e.g. a
  // different browser profile lands the callback). Fail closed otherwise.
  const isDev = process.env.NODE_ENV === 'development';
  const stateOk = isDev ? true : Boolean(state && expectedState && state === expectedState);
  if (!code || !stateOk) {
    console.warn('[google/oauth/callback] invalid state/code', { hasCode: !!code, hasState: !!state, hasCookie: !!expectedState, match: state === expectedState, isDev });
    return popupResult('error', 'Invalid OAuth state.');
  }

  let result: NextResponse;
  try {
    const tok = await exchangeCodeForTokens(code);
    await saveTokens({
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresInSec: tok.expires_in,
      scope: tok.scope,
    });
    console.log('[google/oauth/callback] connected — scopes:', tok.scope, '| refresh_token:', tok.refresh_token ? 'yes' : 'NO');
    result = popupResult('connected');
  } catch (e) {
    console.error('[google/oauth/callback] token exchange / save failed:', (e as Error)?.message);
    result = popupResult('error', (e as Error)?.message?.slice(0, 160) || 'Token exchange failed.');
  }
  // Clear the single-use state cookie.
  result.cookies.set('g_oauth_state', '', { maxAge: 0, path: '/' });
  return result;
}
