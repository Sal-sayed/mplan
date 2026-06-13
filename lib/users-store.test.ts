/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for users-store. Mocks @supabase/supabase-js (in-memory, id-upsert)
// and fs/promises (no disk), like the other store tests.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let rows: any[] = [];
function makeClient() {
  return {
    from() {
      let filtered = rows;
      const api: any = {
        upsert(input: any) {
          const incoming = Array.isArray(input) ? input : [input];
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const r of incoming) byId.set(r.id, r);
          rows.length = 0;
          rows.push(...byId.values());
          return Promise.resolve({ error: null });
        },
        select() {
          return api;
        },
        eq(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] === val);
          return api;
        },
        limit(n: number) {
          return Promise.resolve({ data: filtered.slice(0, n), error: null });
        },
      };
      return api;
    },
  };
}

mockModule('@supabase/supabase-js', { namedExports: { createClient: () => makeClient() } });
const fsStub = {
  mkdir: async () => {},
  readFile: async () => {
    throw new Error('no local file');
  },
  writeFile: async () => {},
};
mockModule('fs/promises', { namedExports: fsStub, defaultExport: fsStub });

const { upsertUser, getUser } = await import('./users-store.ts');

beforeEach(() => {
  rows = [];
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
});

test('upsertUser then getUser round-trips', async () => {
  const saved = await upsertUser({ id: 'sub_123', email: 'a@example.com', name: 'Ada' });
  assert.equal(saved.id, 'sub_123');
  assert.equal(saved.email, 'a@example.com');
  const got = await getUser('sub_123');
  assert.ok(got);
  assert.deepEqual(got, saved);
});

test('getUser returns null for an unknown id', async () => {
  assert.equal(await getUser('nope'), null);
});

test('re-login updates name/email but preserves created_at and does not duplicate', async () => {
  const first = await upsertUser({ id: 'sub_123', email: 'a@example.com', name: 'Ada' });
  const second = await upsertUser({ id: 'sub_123', name: 'Ada L.' });
  assert.equal(rows.length, 1, 'no duplicate row for the same id');
  assert.equal(second.name, 'Ada L.');
  assert.equal(second.email, 'a@example.com', 'email preserved when omitted');
  assert.equal(second.created_at, first.created_at, 'created_at preserved across re-login');
});
