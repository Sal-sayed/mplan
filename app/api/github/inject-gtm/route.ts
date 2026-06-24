// POST /api/github/inject-gtm — the orchestration. Signed-in user + connected repo:
// resolve the site's <head> file, and IF confident, open a PULL REQUEST adding the
// GTM container snippet to it. Otherwise return the paste-fallback snippet.
//
// HARD INVARIANTS:
//   - NEVER commit to the default branch. Always create a NEW branch, commit there,
//     and open a PR with base = default branch.
//   - NEVER auto-merge. The PR is left for the human to review + merge.
//   - NEVER inject when not confident — return the snippet for manual pasting.
//   - ONLY the GTM <head> snippet. No dataLayer-push / business-logic injection.
//
// Body: { owner: string, repo: string, containerId: "GTM-XXXX" }

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/github/token-store';
import { getDefaultBranch, getFileContents, createBranch, commitFile, openPullRequest } from '@/lib/github/repo';
import { CANDIDATE_PATHS, resolveHeadInjection, buildPasteInstructions } from '@/lib/github/head-injector';

const GTM_ID_RE = /^GTM-[A-Z0-9]+$/i;

export async function POST(req: NextRequest) {
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ error: 'Sign in and connect GitHub first.' }, { status: 401 });
  }

  let body: { owner?: unknown; repo?: unknown; containerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
  const repo = typeof body.repo === 'string' ? body.repo.trim() : '';
  const containerId = typeof body.containerId === 'string' ? body.containerId.trim().toUpperCase() : '';
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required.' }, { status: 400 });
  }
  if (!GTM_ID_RE.test(containerId)) {
    return NextResponse.json({ error: 'A valid GTM container ID (GTM-XXXX) is required.' }, { status: 400 });
  }

  let token: string;
  try {
    token = await getValidAccessToken(ownerId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'GitHub not connected.' }, { status: 401 });
  }

  try {
    // 1. Read the default branch + its head SHA (the PR base, and the branch point).
    const { branch: defaultBranch, sha: baseSha } = await getDefaultBranch(token, owner, repo);

    // 2. Fetch the conventional entry-file candidates (read-only).
    const candidates = (
      await Promise.all(CANDIDATE_PATHS.map((p) => getFileContents(token, owner, repo, p, defaultBranch)))
    ).filter((f): f is NonNullable<typeof f> => Boolean(f));

    // 3. Decide — pure resolver. Never guesses outside the confident allowlist.
    const decision = resolveHeadInjection(candidates, containerId);

    if (decision.status === 'already_installed') {
      return NextResponse.json({
        status: 'already_installed',
        filePath: decision.filePath,
        message: `A Google Tag Manager snippet is already present in ${decision.filePath}.`,
      });
    }

    if (decision.status === 'not_confident') {
      // SAFE FALLBACK — do NOT touch the repo. Hand back the snippet to paste.
      return NextResponse.json({
        status: 'manual',
        message:
          "Couldn't confidently locate your site's <head>, so nothing was changed. " +
          'Paste this snippet into your HTML manually.',
        pasteSnippet: decision.pasteSnippet,
      });
    }

    // 4. Confident → create a NEW branch off the default branch head and commit there.
    const target = candidates.find((c) => c.path === decision.filePath);
    const newBranch = `add-gtm-${containerId.toLowerCase()}-${randomBytes(3).toString('hex')}`;
    await createBranch(token, owner, repo, newBranch, baseSha);
    await commitFile(token, owner, repo, {
      branch: newBranch, // NEVER the default branch
      path: decision.filePath,
      content: decision.newContent,
      message: `Add Google Tag Manager (${containerId}) to ${decision.filePath}`,
      sha: target?.sha,
    });

    // 5. Open a PR for the human to review + merge. base = default branch.
    const pr = await openPullRequest(token, owner, repo, {
      base: defaultBranch,
      head: newBranch,
      title: `Add Google Tag Manager (${containerId}) to the site <head>`,
      body:
        `This pull request adds your Google Tag Manager container **${containerId}** to ` +
        `\`${decision.filePath}\`:\n\n` +
        `- the GTM loader \`<script>\` immediately after the opening \`<head>\` tag\n` +
        `- the GTM \`<noscript>\` fallback immediately after the opening \`<body>\` tag\n\n` +
        `Once merged, GA4 / Google Ads / Meta and your other tags can be configured inside ` +
        `Tag Manager with no further code changes. Review the diff and merge when you're ready — ` +
        `this PR makes no other changes.\n\n` +
        `_Opened by the Measurement Plan agent. It never pushes to \`${defaultBranch}\` directly._`,
    });

    return NextResponse.json({
      status: 'pr_opened',
      filePath: decision.filePath,
      branch: newBranch,
      base: defaultBranch,
      prUrl: pr.url,
      prNumber: pr.number,
    });
  } catch (e) {
    const message = (e as Error)?.message || 'GitHub request failed.';
    // Even on failure, give the user the manual snippet so they're never stuck.
    return NextResponse.json({ status: 'error', error: message, pasteSnippet: buildPasteInstructions(containerId) }, { status: 502 });
  }
}
