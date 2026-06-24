/* eslint-disable @typescript-eslint/no-explicit-any */
// inject-gtm orchestration: a confident location → create a NEW branch, commit to
// THAT branch, open a PR with base=default (NEVER writes to the default branch);
// an unconfident location → paste fallback, no repo mutation; anonymous → rejected.
// Mocks the boundaries (auth, token-store, repo, next/server); uses the REAL
// head-injector so the real decision logic is exercised.

import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type MockModuleFn = (
  specifier: string,
  options: { namedExports?: Record<string, unknown>; defaultExport?: unknown }
) => void;
const mockModule = (mock as unknown as { module: MockModuleFn }).module.bind(mock);

let ownerId: string | null = 'user_A';
let filesByPath: Record<string, { path: string; content: string; sha: string } | null> = {};

// Recorded calls so we can assert what the orchestration did to the repo.
const calls = {
  getDefaultBranch: [] as any[],
  createBranch: [] as any[],
  commitFile: [] as any[],
  openPullRequest: [] as any[],
};

mockModule('@/lib/auth', { namedExports: { resolveConnectOwnerId: async () => ownerId } });
mockModule('@/lib/github/token-store', { namedExports: { getValidAccessToken: async () => 'gh-token' } });
mockModule('@/lib/github/repo', {
  namedExports: {
    getDefaultBranch: async (...a: any[]) => {
      calls.getDefaultBranch.push(a);
      return { branch: 'main', sha: 'base-sha-123' };
    },
    getFileContents: async (_t: string, _o: string, _r: string, path: string) => filesByPath[path] ?? null,
    createBranch: async (...a: any[]) => {
      calls.createBranch.push(a);
    },
    commitFile: async (...a: any[]) => {
      calls.commitFile.push(a);
    },
    openPullRequest: async (...a: any[]) => {
      calls.openPullRequest.push(a);
      return { url: 'https://github.com/o/r/pull/7', number: 7 };
    },
  },
});
mockModule('next/server', {
  namedExports: {
    NextRequest: class NextRequest {},
    NextResponse: {
      json(body: any, init?: { status?: number }) {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});

const { POST } = (await import('./route.ts')) as { POST: (req: any) => Promise<Response> };

const makeReq = (body: any) => ({ cookies: { get: () => undefined }, json: async () => body });

beforeEach(() => {
  ownerId = 'user_A';
  filesByPath = {};
  calls.getDefaultBranch = [];
  calls.createBranch = [];
  calls.commitFile = [];
  calls.openPullRequest = [];
});

test('confident location → new branch + commit to that branch + PR (base=default), NEVER touches default branch', async () => {
  filesByPath['index.html'] = { path: 'index.html', content: '<html><head></head><body></body></html>', sha: 'blob-sha' };

  const res = await POST(makeReq({ owner: 'o', repo: 'r', containerId: 'GTM-ABC1234' }));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, 'pr_opened');
  assert.equal(body.prUrl, 'https://github.com/o/r/pull/7');

  // A branch was created off the default-branch head SHA.
  assert.equal(calls.createBranch.length, 1);
  const newBranch = calls.createBranch[0][3];
  const fromSha = calls.createBranch[0][4];
  assert.equal(fromSha, 'base-sha-123');
  assert.notEqual(newBranch, 'main', 'the working branch is NOT the default branch');

  // The commit went to the NEW branch, never to main.
  assert.equal(calls.commitFile.length, 1);
  const commitArgs = calls.commitFile[0][3];
  assert.equal(commitArgs.branch, newBranch);
  assert.notEqual(commitArgs.branch, 'main', 'NEVER commits to the default branch');
  assert.ok(commitArgs.content.includes('GTM-ABC1234'), 'committed content carries the container id');
  assert.equal(commitArgs.sha, 'blob-sha', 'updates the existing file via its blob sha');

  // The PR targets the default branch from the new branch. No merge call exists.
  assert.equal(calls.openPullRequest.length, 1);
  const prArgs = calls.openPullRequest[0][3];
  assert.equal(prArgs.base, 'main');
  assert.equal(prArgs.head, newBranch);
});

test('unconfident location → paste fallback, repo is NOT mutated', async () => {
  filesByPath['index.html'] = { path: 'index.html', content: '<html><body>no head</body></html>', sha: 'b' };

  const res = await POST(makeReq({ owner: 'o', repo: 'r', containerId: 'GTM-ABC1234' }));
  const body = await res.json();

  assert.equal(body.status, 'manual');
  assert.ok(body.pasteSnippet.includes('GTM-ABC1234'));
  assert.equal(calls.createBranch.length, 0, 'no branch created');
  assert.equal(calls.commitFile.length, 0, 'nothing committed');
  assert.equal(calls.openPullRequest.length, 0, 'no PR opened');
});

test('already-installed → no-op, repo not mutated', async () => {
  filesByPath['index.html'] = {
    path: 'index.html',
    content: '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script></head><body></body></html>',
    sha: 'b',
  };
  const res = await POST(makeReq({ owner: 'o', repo: 'r', containerId: 'GTM-ABC1234' }));
  const body = await res.json();
  assert.equal(body.status, 'already_installed');
  assert.equal(calls.createBranch.length, 0);
  assert.equal(calls.commitFile.length, 0);
});

test('anonymous caller (no connect owner) → 401, no GitHub calls at all', async () => {
  ownerId = null;
  filesByPath['index.html'] = { path: 'index.html', content: '<html><head></head><body></body></html>', sha: 'b' };

  const res = await POST(makeReq({ owner: 'o', repo: 'r', containerId: 'GTM-ABC1234' }));
  assert.equal(res.status, 401);
  assert.equal(calls.getDefaultBranch.length, 0, 'never reached the repo');
  assert.equal(calls.createBranch.length, 0);
  assert.equal(calls.commitFile.length, 0);
  assert.equal(calls.openPullRequest.length, 0);
});

test('invalid container id → 400 before any repo work', async () => {
  const res = await POST(makeReq({ owner: 'o', repo: 'r', containerId: 'not-a-gtm-id' }));
  assert.equal(res.status, 400);
  assert.equal(calls.getDefaultBranch.length, 0);
});
