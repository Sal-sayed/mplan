// The write-consent auth URL requests tagmanager.edit.containers but NEVER
// tagmanager.publish (Phase B writes to an unpublished workspace only).

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthUrl, buildWriteAuthUrl, GTM_WRITE_SCOPE } from './oauth.ts';

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-abc.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
});

test('GTM_WRITE_SCOPE is edit.containers (NOT publish)', () => {
  assert.equal(GTM_WRITE_SCOPE, 'https://www.googleapis.com/auth/tagmanager.edit.containers');
  assert.ok(!GTM_WRITE_SCOPE.includes('publish'));
});

test('buildWriteAuthUrl requests the write scope + keeps read scopes, never publish', () => {
  const scope = new URL(buildWriteAuthUrl('s')).searchParams.get('scope') ?? '';
  assert.ok(scope.includes('tagmanager.edit.containers'), 'asks for write');
  assert.ok(scope.includes('analytics.readonly'), 'keeps read scopes');
  assert.ok(!scope.includes('tagmanager.publish'), 'never asks to publish');
  assert.equal(new URL(buildWriteAuthUrl('s')).searchParams.get('include_granted_scopes'), 'true');
});

test('the read-only buildAuthUrl does NOT request the write scope', () => {
  const scope = new URL(buildAuthUrl('s')).searchParams.get('scope') ?? '';
  assert.ok(!scope.includes('tagmanager.edit.containers'));
});
