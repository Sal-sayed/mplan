/* eslint-disable @typescript-eslint/no-explicit-any */
// Assistive dataLayer PR route: creates a NEW branch, commits ONLY the single
// artifact file to it (never an existing source file, never the default branch),
// opens a PR against default. Safety: the ONLY path it ever reads/writes is the
// artifact's own path — it never touches a handler / business-logic file. Mocks the
// GitHub boundary + auth; uses the REAL artifact builder + implementation-proposal.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let ownerId: string | null = 'user_A';

const calls = {
  getDefaultBranch: [] as any[],
  getFileContents: [] as any[],
  createBranch: [] as any[],
  commitFile: [] as any[],
  openPullRequest: [] as any[],
};

mockModule('@/lib/auth', { namedExports: { resolveConnectOwnerId: async () => ownerId } });
mockModule('@/lib/github/token-store', { namedExports: { getValidAccessToken: async () => 'gh-token' } });
mockModule('@/lib/measurement/generate-plan', { namedExports: { validateMeasurementPlan: () => {} } });
mockModule('@/lib/github/repo', {
  namedExports: {
    getDefaultBranch: async (...a: any[]) => { calls.getDefaultBranch.push(a); return { branch: 'main', sha: 'base-sha-1' }; },
    getFileContents: async (_t: string, _o: string, _r: string, path: string) => { calls.getFileContents.push(path); return null; },
    createBranch: async (...a: any[]) => { calls.createBranch.push(a); },
    commitFile: async (...a: any[]) => { calls.commitFile.push(a); },
    openPullRequest: async (...a: any[]) => { calls.openPullRequest.push(a); return { url: 'https://github.com/o/r/pull/12', number: 12 }; },
  },
});
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number }) {
        return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } });
      },
    },
  },
});

const { POST } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response> };

const plan = () => ({
  meta: { url: 'https://shop.example.com', businessModel: 'ecommerce' },
  events: [
    { id: 'e1', name: 'purchase', category: 'ecommerce', description: 'Orders', isKeyEvent: true, parameters: [{ name: 'value', type: 'number' }] },
    { id: 'e2', name: 'page_view', category: 'page', description: 'Page views', isKeyEvent: false, parameters: [] },
  ],
  dataLayer: [{ key: 'value', type: 'number', example: '10' }],
});

const makeReq = (body: any) => ({ cookies: { get: () => undefined }, json: async () => body });

beforeEach(() => {
  ownerId = 'user_A';
  calls.getDefaultBranch = []; calls.getFileContents = []; calls.createBranch = []; calls.commitFile = []; calls.openPullRequest = [];
});

const ARTIFACT = 'ANALYTICS-DATALAYER.md';

test('opens a PR: new branch + commit ONLY the artifact file + base=default, never the default branch', async () => {
  const res = await POST(makeReq({ owner: 'o', repo: 'r', plan: plan() }));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, 'pr_opened');
  assert.equal(body.filePath, ARTIFACT);
  assert.equal(body.eventCount, 2);

  assert.equal(calls.createBranch.length, 1);
  const newBranch = calls.createBranch[0][3];
  assert.equal(calls.createBranch[0][4], 'base-sha-1');
  assert.notEqual(newBranch, 'main', 'works on a NEW branch');

  // Exactly one commit, of ONLY the artifact file, to the new branch.
  assert.equal(calls.commitFile.length, 1, 'commits exactly one file');
  const commitArgs = calls.commitFile[0][3];
  assert.equal(commitArgs.path, ARTIFACT, 'commits ONLY the artifact file');
  assert.equal(commitArgs.branch, newBranch);
  assert.notEqual(commitArgs.branch, 'main', 'NEVER commits to the default branch');
  assert.match(commitArgs.content, /dataLayer\.push\(/, 'artifact carries the push snippets');

  // PR targets default from the new branch.
  assert.equal(calls.openPullRequest.length, 1);
  assert.equal(calls.openPullRequest[0][3].base, 'main');
  assert.equal(calls.openPullRequest[0][3].head, newBranch);
});

test('SAFETY: the only path it ever reads is the artifact’s own — never a handler / source file', async () => {
  await POST(makeReq({ owner: 'o', repo: 'r', plan: plan() }));
  // It reads only the artifact path (to update its own file), nothing else.
  for (const path of calls.getFileContents) assert.equal(path, ARTIFACT, 'never reads a non-artifact file');
  // And it writes only the artifact path.
  for (const c of calls.commitFile) assert.equal(c[3].path, ARTIFACT, 'never writes a non-artifact file');
});

test('anonymous / not-connected caller → 401, no GitHub calls at all', async () => {
  ownerId = null;
  const res = await POST(makeReq({ owner: 'o', repo: 'r', plan: plan() }));
  assert.equal(res.status, 401);
  assert.equal(calls.getDefaultBranch.length, 0);
  assert.equal(calls.createBranch.length, 0);
  assert.equal(calls.commitFile.length, 0);
  assert.equal(calls.openPullRequest.length, 0);
});

test('missing owner/repo → 400 before any GitHub work', async () => {
  const res = await POST(makeReq({ plan: plan() }));
  assert.equal(res.status, 400);
  assert.equal(calls.getDefaultBranch.length, 0);
});

test('missing plan → 400', async () => {
  const res = await POST(makeReq({ owner: 'o', repo: 'r' }));
  assert.equal(res.status, 400);
  assert.equal(calls.createBranch.length, 0);
});
