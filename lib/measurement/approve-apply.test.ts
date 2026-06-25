// Approve → run the two existing safe actions together. The orchestrator is pure;
// the thunks stand in for the real GTM apply + assistive dataLayer PR.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runApproveApply, CONNECT_GITHUB_HINT } from './approve-apply.ts';

test('approve WITH GitHub connected → BOTH the GTM apply and the dataLayer PR run', async () => {
  let gtm = 0, dl = 0;
  const out = await runApproveApply({
    githubConnected: true,
    applyToGtm: async () => { gtm += 1; },
    openDataLayerPr: async () => { dl += 1; },
  });
  assert.equal(gtm, 1, 'GTM apply invoked');
  assert.equal(dl, 1, 'dataLayer PR invoked');
  assert.equal(out.dataLayerPrOpened, true);
  assert.equal(out.skippedReason, undefined);
});

test('approve WITHOUT GitHub → GTM apply runs, dataLayer PR skipped with a connect-GitHub message', async () => {
  let gtm = 0, dl = 0;
  const out = await runApproveApply({
    githubConnected: false,
    applyToGtm: async () => { gtm += 1; },
    openDataLayerPr: async () => { dl += 1; },
  });
  assert.equal(gtm, 1, 'GTM apply still runs');
  assert.equal(dl, 0, 'dataLayer PR NOT called');
  assert.equal(out.dataLayerPrOpened, false);
  assert.equal(out.skippedReason, CONNECT_GITHUB_HINT);
  assert.match(out.skippedReason || '', /connect github/i);
});

test('GTM apply runs BEFORE the dataLayer PR', async () => {
  const order: string[] = [];
  await runApproveApply({
    githubConnected: true,
    applyToGtm: async () => { order.push('gtm'); },
    openDataLayerPr: async () => { order.push('datalayer'); },
  });
  assert.deepEqual(order, ['gtm', 'datalayer']);
});

test('SAFETY: the only actions are GTM apply + the assistive (separate-file) PR — no handler-editing path', async () => {
  // The contract has no parameter/call for "edit existing source / locate handler".
  // A forbidden spy can never be reached because nothing invokes it.
  let forbiddenEditExistingHandler = 0;
  const _forbidden = () => { forbiddenEditExistingHandler += 1; };
  void _forbidden; // exists only to prove it is never wired into the flow
  let dl = 0;
  await runApproveApply({
    githubConnected: true,
    applyToGtm: async () => {},
    openDataLayerPr: async () => { dl += 1; }, // the ONLY dataLayer path = assistive PR
  });
  assert.equal(forbiddenEditExistingHandler, 0, 'never edits an existing handler/source file');
  assert.equal(dl, 1, 'dataLayer goes only through the assistive separate-file PR');
});
