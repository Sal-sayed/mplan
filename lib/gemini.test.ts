// gemini.test.ts — transport-level retry behaviour (FIX A). Stubs global fetch;
// no live Gemini calls. Retries ONLY 503/429; other statuses propagate at once.

import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { geminiGenerate } from './gemini.ts';

const realFetch = globalThis.fetch;

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Returns successive responses from `seq`; repeats the last one once exhausted.
// `calls()` reports how many times fetch was invoked.
function stubFetch(seq: Array<() => Response>): { calls: () => number } {
  let i = 0;
  globalThis.fetch = (async () => {
    const make = seq[Math.min(i, seq.length - 1)];
    i += 1;
    return make();
  }) as typeof fetch;
  return { calls: () => i };
}

const GOOD = {
  candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
};
const ARGS = { model: 'gemini-2.5-flash', userMessage: 'x', maxOutputTokens: 10 };

beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });
afterEach(() => { globalThis.fetch = realFetch; });

test('503 then 200 → resolves, retried exactly once', async () => {
  const f = stubFetch([
    () => jsonResp(503, { error: { message: 'experiencing high demand' } }),
    () => jsonResp(200, GOOD),
  ]);
  const { text } = await geminiGenerate(ARGS);
  assert.match(text, /ok/);
  assert.equal(f.calls(), 2);
});

test('429 on every attempt → throws after the cap (3 attempts: initial + 2 retries)', async () => {
  const f = stubFetch([() => jsonResp(429, { error: { message: 'rate limit exceeded' } })]);
  await assert.rejects(() => geminiGenerate(ARGS), /429|rate limit/);
  assert.equal(f.calls(), 3);
});

test('401 → throws immediately, no retry', async () => {
  const f = stubFetch([() => jsonResp(401, { error: { message: 'invalid api key' } })]);
  await assert.rejects(() => geminiGenerate(ARGS), /401|invalid api key/);
  assert.equal(f.calls(), 1);
});

test('400 (bad request) → throws immediately, no retry', async () => {
  const f = stubFetch([() => jsonResp(400, { error: { message: 'bad request' } })]);
  await assert.rejects(() => geminiGenerate(ARGS), /400|bad request/);
  assert.equal(f.calls(), 1);
});
