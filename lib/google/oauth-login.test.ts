// Unit tests for the Google Sign-In helpers. buildLoginAuthUrl is pure;
// exchangeCodeForIdentity is tested by mocking global.fetch (the token exchange)
// and decoding a synthetic id_token.

import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildLoginAuthUrl, exchangeCodeForIdentity, isLoginConfigured } from './oauth-login.ts';

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-abc.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
  process.env.GOOGLE_LOGIN_REDIRECT_URI = 'https://app.example.com/api/auth/google/callback';
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

test('isLoginConfigured reflects the env', () => {
  assert.equal(isLoginConfigured(), true);
});

test('buildLoginAuthUrl carries client_id, the identity scopes, redirect, and state', () => {
  const url = new URL(buildLoginAuthUrl('state-123'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-abc.apps.googleusercontent.com');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example.com/api/auth/google/callback');
  assert.equal(url.searchParams.get('state'), 'state-123');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('exchangeCodeForIdentity returns the identity from the id_token', async () => {
  const idToken = fakeIdToken({ sub: '110055', email: 'ada@example.com', name: 'Ada Lovelace', email_verified: true });
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ id_token: idToken }) })) as unknown as typeof fetch;

  const identity = await exchangeCodeForIdentity('auth-code');
  assert.equal(identity.sub, '110055');
  assert.equal(identity.email, 'ada@example.com');
  assert.equal(identity.name, 'Ada Lovelace');
  assert.equal(identity.emailVerified, true);
});

test('exchangeCodeForIdentity throws on a token-endpoint error', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })) as unknown as typeof fetch;
  await assert.rejects(() => exchangeCodeForIdentity('bad-code'), /invalid_grant/);
});

test('exchangeCodeForIdentity throws when no id_token is returned', async () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'x' }) })) as unknown as typeof fetch;
  await assert.rejects(() => exchangeCodeForIdentity('code'), /no id_token/);
});
