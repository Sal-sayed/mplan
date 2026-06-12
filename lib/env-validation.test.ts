// Pure test for the boot-time env guard. validateEnv() memoizes via a module
// flag, so it runs once per (isolated) test-file process — one assertion here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from './env-validation.ts';

test('validateEnv fails fast on a too-short JWT_SECRET', () => {
  // Satisfy the other always-required vars so the only failure is JWT length.
  process.env.GEMINI_API_KEY = 'x';
  process.env.SUPABASE_URL = 'x';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  process.env.JWT_SECRET = 'too-short'; // < 32 chars
  delete process.env.NEXT_PHASE; // ensure we're not skipped as the build phase
  // The aggregate "missing vars" error includes the JWT length line regardless
  // of NODE_ENV, so we needn't force a mode here.
  assert.throws(() => validateEnv(), /JWT_SECRET.*32/);
});
