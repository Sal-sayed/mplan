// Per-user token isolation (Stage 4). Drives the local-file fallback (no Supabase
// env) with an in-memory fs mock; JWT_SECRET set for the refresh-token encryption.
// Tokens are non-expiring here so getValidAccessToken returns without refreshing.

process.env.JWT_SECRET = 'stage4-token-store-test-secret-0123456789';

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let fileContent: string | null = null;
const fsStub = {
  mkdir: async () => {},
  readFile: async () => {
    if (fileContent == null) throw new Error('no file');
    return fileContent;
  },
  writeFile: async (_p: string, data: string) => {
    fileContent = data;
  },
  unlink: async () => {
    fileContent = null;
  },
};
mockModule('fs/promises', { namedExports: fsStub, defaultExport: fsStub });

const { saveTokens, getValidAccessToken, getStatus, clearTokens } = await import('./token-store.ts');

const conn = (accessToken: string) => ({ accessToken, refreshToken: `refresh-${accessToken}`, expiresInSec: 3600, scope: 'https://www.googleapis.com/auth/analytics.readonly' });

beforeEach(() => {
  fileContent = null; // no Supabase env set → local-map fallback
});

test('each user gets back ONLY their own access token', async () => {
  await saveTokens('user_A', conn('tokA'));
  await saveTokens('user_B', conn('tokB'));
  assert.equal(await getValidAccessToken('user_A'), 'tokA');
  assert.equal(await getValidAccessToken('user_B'), 'tokB');
});

test('getStatus is per-user; an unconnected user is not connected', async () => {
  await saveTokens('user_A', conn('tokA'));
  assert.equal((await getStatus('user_A')).connected, true);
  assert.equal((await getStatus('user_C')).connected, false);
});

test('an unconnected user has no token (throws)', async () => {
  await assert.rejects(() => getValidAccessToken('nobody'), /not connected/i);
});

test('clearTokens removes ONLY that user — the other survives', async () => {
  await saveTokens('user_A', conn('tokA'));
  await saveTokens('user_B', conn('tokB'));
  await clearTokens('user_A');
  await assert.rejects(() => getValidAccessToken('user_A'), /not connected/i);
  assert.equal(await getValidAccessToken('user_B'), 'tokB', 'B is untouched');
});
