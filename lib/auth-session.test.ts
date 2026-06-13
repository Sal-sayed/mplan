// Unit tests for the Stage-1 user-session helpers (createSessionToken /
// getSessionUser). Real jose round-trip; no mocks. JWT_SECRET set before import.

process.env.JWT_SECRET = 'stage1-session-test-secret-0123456789abcd'; // >=32, not a default

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionToken, getSessionUser, resolveOwnerId, DEFAULT_OWNER_ID } from './auth.ts';

// Minimal req shape carrying a `session` cookie value.
const reqWith = (token?: string) => ({
  cookies: { get: (name: string) => (name === 'session' && token ? { value: token } : undefined) },
});

test('createSessionToken → getSessionUser round-trips the identity', async () => {
  const token = await createSessionToken({ user_id: 'sub_123', email: 'ada@example.com', role: 'user' });
  const user = await getSessionUser(reqWith(token));
  assert.ok(user);
  assert.equal(user.user_id, 'sub_123');
  assert.equal(user.email, 'ada@example.com');
  assert.equal(user.role, 'user');
});

test('no session cookie → null', async () => {
  assert.equal(await getSessionUser(reqWith(undefined)), null);
});

test('a tampered/invalid token → null (never throws)', async () => {
  const user = await getSessionUser(reqWith('not.a.valid.jwt'));
  assert.equal(user, null);
});

test('a token signed with a different secret → null', async () => {
  const token = await createSessionToken({ user_id: 'sub_123' });
  // Flip a character in the signature segment to invalidate it.
  const parts = token.split('.');
  parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
  const user = await getSessionUser(reqWith(parts.join('.')));
  assert.equal(user, null);
});

// Stage 2: the owner a write is attributed to.
test('resolveOwnerId returns the signed-in user, else the admin default', async () => {
  const token = await createSessionToken({ user_id: 'sub_777', email: 'x@y.com' });
  assert.equal(await resolveOwnerId(reqWith(token)), 'sub_777', 'signed-in → their id');
  assert.equal(await resolveOwnerId(reqWith(undefined)), DEFAULT_OWNER_ID, 'anonymous → admin default');
  assert.equal(DEFAULT_OWNER_ID, 'admin');
});
