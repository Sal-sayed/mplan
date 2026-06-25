// POST /api/github/inject-datalayer — the SAFE "assistive dataLayer" PR.
//
// Adds ONE reference artifact file (ANALYTICS-DATALAYER.md) on a NEW branch and
// opens a PR. The file lists, per event, the exact dataLayer.push(...) + a "fires
// when" + a TODO/verify placement instruction. The developer places each snippet
// in the right handler themselves and verifies.
//
// HARD SAFETY INVARIANTS:
//   - NEVER reads/edits the developer's existing source, handlers, or business
//     logic. It only ADDS the single artifact file (and, for idempotency, reads
//     ONLY that artifact's own path to update it on a re-run).
//   - NEVER commits to the default branch. Always a NEW branch + a PR (base=default).
//   - NEVER auto-merges. The human reviews, places the snippets, and merges.
//
// Body: { owner: string, repo: string, plan: MeasurementPlan }

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/github/token-store';
import { getDefaultBranch, getFileContents, listTree, createBranch, commitFile, openPullRequest } from '@/lib/github/repo';
import { buildDataLayerArtifact, DATALAYER_ARTIFACT_PATH } from '@/lib/github/datalayer-artifact';
import { suggestLocations, type LocationSuggestion } from '@/lib/github/datalayer-locator';
import { buildImplementationProposal } from '@/lib/measurement/implementation-proposal';
import { classifyEvents } from '@/lib/measurement/event-routing';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ error: 'Sign in and connect GitHub first.' }, { status: 401 });
  }

  let body: { owner?: unknown; repo?: unknown; plan?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
  const repo = typeof body.repo === 'string' ? body.repo.trim() : '';
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required.' }, { status: 400 });
  }
  if (!body.plan) {
    return NextResponse.json({ error: 'A generated plan is required.' }, { status: 400 });
  }
  try {
    validateMeasurementPlan(body.plan);
  } catch (err) {
    return NextResponse.json({ error: `Invalid plan: ${(err as Error)?.message ?? 'unknown shape'}` }, { status: 400 });
  }

  // Only the events that GENUINELY need a developer-placed push (rich app-state
  // data) go into the file — the ones GTM can capture on its own are excluded.
  const plan = body.plan as MeasurementPlan;
  const { needsRichPush } = classifyEvents(plan);
  const richIds = new Set(needsRichPush.map((e) => e.id));
  const items = buildImplementationProposal(plan).items.filter((it) => richIds.has(it.eventId));
  if (items.length === 0) {
    // Everything is GTM-capturable — nothing needs placing in code.
    return NextResponse.json({
      status: 'none_needed',
      message: 'All your events can be captured by GTM automatically — no dataLayer pushes need placing in your code.',
    });
  }

  let token: string;
  try {
    token = await getValidAccessToken(ownerId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'GitHub not connected.' }, { status: 401 });
  }

  try {
    // 1. Default branch (PR base + branch point).
    const { branch: defaultBranch, sha: baseSha } = await getDefaultBranch(token, owner, repo);

    // 2. READ-ONLY: list the repo tree + read a few candidate files to SUGGEST where
    //    each push should go. Best-effort — never fails the PR, never edits anything.
    let suggestions: LocationSuggestion[] = [];
    try {
      const tree = await listTree(token, owner, repo, baseSha);
      const repoTree = tree.filter((e) => e.type === 'blob').map((e) => e.path);
      suggestions = await suggestLocations({
        events: needsRichPush.map((e) => ({ name: e.name, category: e.category })),
        repoTree,
        readFile: async (p) => (await getFileContents(token, owner, repo, p, defaultBranch))?.content ?? null,
      });
    } catch {
      /* suggestions are best-effort — proceed with the snippets alone */
    }

    // 3. Build the artifact (snippets + best-effort SUGGESTED file/hint per event).
    const artifact = buildDataLayerArtifact(items, suggestions);

    // 4. Read ONLY our own artifact path so a re-run updates the same file.
    const existing = await getFileContents(token, owner, repo, DATALAYER_ARTIFACT_PATH, defaultBranch);

    // 5. New branch → commit ONLY the artifact file to it (never the default branch).
    const newBranch = `add-datalayer-snippets-${randomBytes(3).toString('hex')}`;
    await createBranch(token, owner, repo, newBranch, baseSha);
    await commitFile(token, owner, repo, {
      branch: newBranch, // NEVER the default branch
      path: DATALAYER_ARTIFACT_PATH,
      content: artifact.contents,
      message: 'Add dataLayer event snippets (review & place)',
      sha: existing?.sha, // update our own artifact if it already exists
    });

    // 7. Open a PR for the human to review, PLACE the snippets, and merge.
    const pr = await openPullRequest(token, owner, repo, {
      base: defaultBranch,
      head: newBranch,
      title: 'Add dataLayer event snippets (review & place)',
      body:
        `This PR adds a single reference file — \`${DATALAYER_ARTIFACT_PATH}\` — containing the ` +
        `\`dataLayer.push(...)\` snippets for your measurement plan (${artifact.eventCount} event` +
        `${artifact.eventCount === 1 ? '' : 's'}), each with a **"fires when"** note and a **TODO** for where to place it.\n\n` +
        `**Important — this is assistive, not automatic:**\n` +
        `- It does **not** edit any of your existing code, handlers, or business logic.\n` +
        `- You must **place each snippet** in the matching action handler yourself (e.g. inside your form's submit handler, after validation) and **verify** it fires.\n` +
        `- Nothing is wired up automatically by merging this — the file is reference + placement instructions.\n\n` +
        `Review the file, place the snippets where they belong, verify, then merge. ` +
        `_Opened by the Measurement Plan agent. It never edits your handlers and never pushes to \`${defaultBranch}\` directly._`,
    });

    return NextResponse.json({
      status: 'pr_opened',
      filePath: DATALAYER_ARTIFACT_PATH,
      branch: newBranch,
      base: defaultBranch,
      eventCount: artifact.eventCount,
      prUrl: pr.url,
      prNumber: pr.number,
    });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: (e as Error)?.message || 'GitHub request failed.' }, { status: 502 });
  }
}
