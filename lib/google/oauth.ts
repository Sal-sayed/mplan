// Google OAuth 2.0 (authorization-code flow), raw fetch — no SDK, mirroring the
// no-dependency style of lib/gemini.ts. Single-operator: ONE Google account is
// connected and its tokens drive the GA4/GTM launch-readiness checks.
//
// This module is pure transport (build URL / exchange code / refresh). Token
// storage lives in token-store.ts.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_REDIRECT = 'http://localhost:3000/api/google/oauth/callback';

// Read-only scopes: GA4 Admin API (properties/keyEvents/customDimensions) and
// Tag Manager API (containers/tags). Both are "sensitive" — fine for a Testing
// consent screen with the operator added as a test user (no verification).
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/tagmanager.readonly',
];

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): OAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to use Google OAuth');
  }
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT;
  return { clientId, clientSecret, redirectUri };
}

export function getRedirectUri(): string {
  return getConfig().redirectUri;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
  id_token?: string;
}

// access_type=offline + prompt=consent are what make Google return a refresh
// token (and re-issue one each time, which keeps Testing-mode tokens fresh).
export function buildAuthUrl(state: string): string {
  return buildAuthUrlForScopes(GOOGLE_SCOPES, state);
}

// Phase B: a SEPARATE write consent — only requested when the user opts to
// auto-apply. Adds tagmanager.edit.containers (create variables/triggers/tags in
// a workspace). It does NOT request tagmanager.publish: Phase B writes to an
// unpublished workspace and the user publishes in GTM themselves. include_granted_
// scopes keeps the existing read scopes, so the upgraded token still does reads.
export const GTM_WRITE_SCOPE = 'https://www.googleapis.com/auth/tagmanager.edit.containers';

// GA4 Admin write scope — lets the app CREATE a GA4 property + web data stream.
// Bundled into the single "Connect for write" consent so one re-consent grants
// both GTM-write and GA4-write (the user picks up whichever feature they use).
export const ANALYTICS_WRITE_SCOPE = 'https://www.googleapis.com/auth/analytics.edit';

export function buildWriteAuthUrl(state: string): string {
  return buildAuthUrlForScopes([...GOOGLE_SCOPES, GTM_WRITE_SCOPE, ANALYTICS_WRITE_SCOPE], state);
}

function buildAuthUrlForScopes(scopes: string[], state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg =
      (json as { error_description?: string; error?: string }).error_description ||
      (json as { error?: string }).error ||
      `Google token endpoint returned ${res.status}`;
    throw new Error(`Google OAuth: ${msg}`);
  }
  return json as GoogleTokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  return postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getConfig();
  return postToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
}
