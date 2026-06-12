/* eslint-disable @typescript-eslint/no-explicit-any */
// Route test for /api/google/status gating: a non-operator must NOT be told the
// connection status; an operator still gets it. Mocks the boundaries only.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let operator = false;
let connStatus: any = {
  connected: true,
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  expiresAt: '2026-06-12T00:00:00.000Z',
};

mockModule('@/lib/auth', { namedExports: { isOperatorRequest: async () => operator } });
mockModule('@/lib/google/oauth', { namedExports: { isOAuthConfigured: () => true } });
mockModule('@/lib/google/token-store', { namedExports: { getStatus: async () => connStatus } });
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        });
      },
    },
  },
});

const { GET } = (await import('./route.ts')) as { GET: (req: any) => Promise<Response> };
const makeReq = () => ({ cookies: { get: () => undefined } });

beforeEach(() => {
  operator = false;
  connStatus = {
    connected: true,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    expiresAt: '2026-06-12T00:00:00.000Z',
  };
});

test('non-operator caller is NOT told the connection status', async () => {
  operator = false;
  const body = await (await GET(makeReq())).json();
  assert.equal(body.isAdmin, false);
  assert.equal(body.connected, false); // real status (connected:true) is hidden
  assert.equal(body.scopes, undefined);
  assert.equal(body.expiresAt, undefined);
  assert.equal(body.configured, true); // feature availability is fine to expose
});

test('operator caller still gets the real connection status', async () => {
  operator = true;
  const body = await (await GET(makeReq())).json();
  assert.equal(body.isAdmin, true);
  assert.equal(body.connected, true);
  assert.deepEqual(body.scopes, ['https://www.googleapis.com/auth/analytics.readonly']);
  assert.equal(body.expiresAt, '2026-06-12T00:00:00.000Z');
});
