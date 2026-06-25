// approve-apply.ts — on "Approve", run the two EXISTING safe actions together:
//   (1) apply the plan to GTM (the unpublished-workspace apply / create), and
//   (2) IF a GitHub repo is connected, open the assistive dataLayer PR — the
//       SEPARATE-FILE PR (snippets + "// TODO place & verify"), which NEVER edits
//       the user's handlers/business logic.
//
// Pure orchestration so the wiring is unit-testable; the real work is done by the
// injected thunks (the existing flows). There is deliberately NO parameter/path for
// "edit an existing source file / locate a handler" — that unsafe auto-write is
// excluded by design, and the dataLayer stays the assistive separate-file PR.

export interface ApproveApplyDeps {
  githubConnected: boolean; // a GitHub repo is connected (and chosen)
  applyToGtm: () => Promise<void>; // existing GTM apply / unpublished-workspace create
  openDataLayerPr: () => Promise<void>; // existing assistive dataLayer PR (separate file)
}

export interface ApproveApplyOutcome {
  gtmApplied: boolean;
  dataLayerPrOpened: boolean;
  skippedReason?: string; // set when the dataLayer PR was skipped
}

export const CONNECT_GITHUB_HINT = 'Connect GitHub to also get the dataLayer snippets as a PR.';

export async function runApproveApply(deps: ApproveApplyDeps): Promise<ApproveApplyOutcome> {
  // 1) GTM apply (unpublished workspace) — always.
  await deps.applyToGtm();

  // 2) Assistive dataLayer PR — only when a GitHub repo is connected. It's the
  //    separate-file PR; it never touches existing handlers. Skip gracefully else.
  if (!deps.githubConnected) {
    return { gtmApplied: true, dataLayerPrOpened: false, skippedReason: CONNECT_GITHUB_HINT };
  }
  await deps.openDataLayerPr();
  return { gtmApplied: true, dataLayerPrOpened: true };
}
