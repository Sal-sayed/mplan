// Hand-rolled Google Sign-In (identity). Mirrors lib/google/oauth.ts (raw fetch,
// no SDK) but for LOGIN, not analytics: it requests openid/email/profile, reads the
// id_token ONCE to identify the user, and does NOT request offline access or store
// a refresh token. Distinct from the analytics OAuth (different scopes + redirect).
//
// This is a SEPARATE concern from the analytics token-store: signing in tells us
// WHO the user is; "Connect Analytics" (the existing flow) reads their GA4. They
// can be the same Google account but are two grants. Per-user analytics token is a
// later stage; this stage is identity only.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_REDIRECT = 'http://localhost:3000/api/auth/google/callback';

export const LOGIN_SCOPES = ['openid', 'email', 'profile'];

export function isLoginConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

interface LoginConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): LoginConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google Sign-In');
  }
  // Distinct redirect from the analytics flow; register it in Google Cloud.
  const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI || DEFAULT_REDIRECT;
  return { clientId, clientSecret, redirectUri };
}

export function buildLoginAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: LOGIN_SCOPES.join(' '),
    state,
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  sub: string; // stable Google account id (the user's primary key)
  email?: string;
  name?: string;
  emailVerified?: boolean;
}

// The id_token is returned by a direct server-to-server TLS exchange with Google's
// token endpoint in return for the auth code, so for the authorization-code flow
// its payload is trusted — we decode (not re-verify the signature) to read identity.
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Malformed id_token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

export async function exchangeCodeForIdentity(code: string): Promise<GoogleIdentity> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(`Google Sign-In: ${json.error_description || json.error || `token endpoint returned ${res.status}`}`);
  }
  if (!json.id_token) throw new Error('Google Sign-In: no id_token returned');

  const p = decodeJwtPayload(json.id_token);
  const sub = typeof p.sub === 'string' ? p.sub : '';
  if (!sub) throw new Error('Google Sign-In: id_token missing sub');
  return {
    sub,
    email: typeof p.email === 'string' ? p.email : undefined,
    name: typeof p.name === 'string' ? p.name : undefined,
    emailVerified: typeof p.email_verified === 'boolean' ? p.email_verified : undefined,
  };
}
