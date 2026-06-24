// GET /api/github/callback — signed-in users only. Verifies the CSRF state,
// exchanges the auth code for a token, reads the GitHub login, stores the encrypted
// token, then returns a tiny HTML page that posts the result to the opener window
// (popup flow) and closes itself. Mirrors /api/google/oauth/callback.

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { exchangeCodeForToken } from '@/lib/github/oauth';
import { saveTokens } from '@/lib/github/token-store';
import { getAuthenticatedLogin } from '@/lib/github/repo';

function popupResult(status: 'connected' | 'error', message?: string): NextResponse {
  const note = status === 'connected'
    ? 'GitHub connected. You can close this window.'
    : 'GitHub connection failed. You can close this window.';
  const payload = JSON.stringify({ source: 'github-oauth', status, ...(message ? { message } : {}) });
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
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    console.warn('[github/callback] rejected — no signed-in user or admin');
    return popupResult('error', 'Not signed in.');
  }

  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.warn('[github/callback] GitHub returned error:', oauthError);
    return popupResult('error', oauthError);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get('gh_oauth_state')?.value;
  // Strict CSRF state match everywhere EXCEPT explicit local development (where the
  // state cookie is easily lost across the cross-site redirect). Fail closed otherwise.
  const isDev = process.env.NODE_ENV === 'development';
  const stateOk = isDev ? true : Boolean(state && expectedState && state === expectedState);
  if (!code || !stateOk) {
    console.warn('[github/callback] invalid state/code', { hasCode: !!code, hasState: !!state, hasCookie: !!expectedState, isDev });
    return popupResult('error', 'Invalid OAuth state.');
  }

  let result: NextResponse;
  try {
    const tok = await exchangeCodeForToken(code);
    let login: string | undefined;
    try {
      login = await getAuthenticatedLogin(tok.access_token);
    } catch {
      /* login is cosmetic — store the token even if /user read fails */
    }
    await saveTokens(ownerId, {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresInSec: tok.expires_in,
      githubLogin: login,
    });
    console.log('[github/callback] connected', { login, expiring: tok.expires_in ? 'yes' : 'no' });
    result = popupResult('connected');
  } catch (e) {
    console.error('[github/callback] token exchange / save failed:', (e as Error)?.message);
    result = popupResult('error', (e as Error)?.message?.slice(0, 160) || 'Token exchange failed.');
  }
  result.cookies.set('gh_oauth_state', '', { maxAge: 0, path: '/' });
  return result;
}
