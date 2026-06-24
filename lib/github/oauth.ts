// GitHub OAuth (authorization-code flow), raw fetch — no SDK, mirroring
// lib/google/oauth.ts. This module is pure transport (build URL / exchange code /
// refresh). Token storage lives in token-store.ts.
//
// ── Target: a GitHub App with FINE-GRAINED, per-repository permissions ──
// The intended production model is a GitHub App the user installs on ONE repo,
// granting only:
//   - Contents:        Read & write   (read the <head> file, push a branch)
//   - Pull requests:   Read & write   (open the PR the human reviews)
// A GitHub App issues an EXPIRING user-to-server token (8h) plus a refresh_token,
// so refreshAccessToken() below is exercised. With a GitHub App the consent URL
// carries NO `scope` (permissions are declared on the App + chosen at install).
//
// Slice-1 fallback: a classic OAuth App. Those tokens do NOT expire and have no
// refresh_token; the `scope` query param selects access — `public_repo` is enough
// for the public-repo slice (use `repo` for private). The code below works for
// BOTH: it sends `scope` (ignored by a GitHub App), and the token store treats a
// missing expires_in as a non-expiring token (no refresh attempted).
//
// REQUIRED ENV:
//   GITHUB_CLIENT_ID         — the App / OAuth App client id
//   GITHUB_CLIENT_SECRET     — the client secret
//   GITHUB_OAUTH_REDIRECT_URI (optional) — defaults to the localhost callback;
//                              must be registered on the App/OAuth App.

const AUTHORIZE_ENDPOINT = 'https://github.com/login/oauth/authorize';
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const DEFAULT_REDIRECT = 'http://localhost:3000/api/github/callback';

// Only consulted in the OAuth-App fallback; a GitHub App ignores it and uses the
// repository permissions configured on the App instead. `public_repo` keeps the
// slice-1 blast radius to public repos; switch to `repo` for private-repo support.
export const GITHUB_SCOPES = ['public_repo'];

export function isConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): OAuthConfig {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set to use GitHub OAuth');
  }
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT;
  return { clientId, clientSecret, redirectUri };
}

export function getRedirectUri(): string {
  return getConfig().redirectUri;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  // Present only for a GitHub App with token expiration enabled:
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    // Ignored by a GitHub App (permissions come from the App); used by an OAuth App.
    scope: GITHUB_SCOPES.join(' '),
    // Re-prompt so a user can pick a different account/installation.
    allow_signup: 'false',
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

async function postToken(params: Record<string, string>): Promise<GitHubTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // GitHub returns form-encoded by default; ask for JSON.
      Accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as GitHubTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || json.error || !json.access_token) {
    const msg = json.error_description || json.error || `GitHub token endpoint returned ${res.status}`;
    throw new Error(`GitHub OAuth: ${msg}`);
  }
  return json;
}

export async function exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  return postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

// Only meaningful for a GitHub App (expiring tokens). An OAuth App never returns a
// refresh_token, so this is never reached for that flow.
export async function refreshAccessToken(refreshToken: string): Promise<GitHubTokenResponse> {
  const { clientId, clientSecret } = getConfig();
  return postToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
}
