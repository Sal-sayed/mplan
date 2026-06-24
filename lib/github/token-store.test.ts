// Per-user GitHub token isolation + round-trip. Drives the local-file fallback (no
// Supabase env) with an in-memory fs mock; JWT_SECRET set for AES-256-GCM. Tokens
// are non-expiring (OAuth-App style) so getValidAccessToken returns without refresh.

process.env.JWT_SECRET = 'github-token-store-test-secret-0123456789';

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

const conn = (accessToken: string, login?: string) => ({ accessToken, refreshToken: `refresh-${accessToken}`, githubLogin: login });

beforeEach(() => {
  fileContent = null; // no Supabase env set → local-map fallback
});

test('save → getValidAccessToken round-trips the (decrypted) token', async () => {
  await saveTokens('user_A', conn('ghp_tokenA', 'octocat'));
  assert.equal(await getValidAccessToken('user_A'), 'ghp_tokenA');
  // The token is encrypted at rest — the plaintext must NOT appear on disk.
  assert.ok(fileContent && !fileContent.includes('ghp_tokenA'), 'access token is encrypted in storage');
});

test('per-user isolation — user A’s token is never returned for user B', async () => {
  await saveTokens('user_A', conn('ghp_tokenA'));
  await saveTokens('user_B', conn('ghp_tokenB'));
  assert.equal(await getValidAccessToken('user_A'), 'ghp_tokenA');
  assert.equal(await getValidAccessToken('user_B'), 'ghp_tokenB');
});

test('getStatus is per-user and surfaces the login; an unconnected user is not connected', async () => {
  await saveTokens('user_A', conn('ghp_tokenA', 'octocat'));
  const a = await getStatus('user_A');
  assert.equal(a.connected, true);
  assert.equal(a.login, 'octocat');
  assert.equal((await getStatus('user_C')).connected, false);
});

test('an unconnected user has no token (throws)', async () => {
  await assert.rejects(() => getValidAccessToken('nobody'), /not connected/i);
});

test('clearTokens removes ONLY that user — the other survives', async () => {
  await saveTokens('user_A', conn('ghp_tokenA'));
  await saveTokens('user_B', conn('ghp_tokenB'));
  await clearTokens('user_A');
  await assert.rejects(() => getValidAccessToken('user_A'), /not connected/i);
  assert.equal(await getValidAccessToken('user_B'), 'ghp_tokenB', 'B is untouched');
});
