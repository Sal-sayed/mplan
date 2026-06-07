// run-monitor-check.ts
// The orchestrator: audit -> adapt -> load previous -> diff -> store.
//
// HARD BOUNDARY: the only "what should fire" baseline is the PREVIOUS STORED
// RUN. Nothing here imports the Measurement Plan generation code.

import { auditExistingSite } from "./existing-site-auditor";
import { toMonitorRun } from "./monitor-adapter";
import { monitorStore, type MonitorStore } from "./monitor-store";
import { scoreCaptureConfidence } from "./capture-confidence";
import { diffRuns, type DiffResult } from "./monitor-diff";

export type MonitorCheckResult = DiffResult & { stored: boolean };

// Alerting STUB. When a real regression is confirmed, this is the single hook.
// For now it only logs; do NOT build a notification system here.
function notifyRegression(result: DiffResult): void {
  const critical = result.findings.filter((f) => f.severity === "critical");
  console.error(`[monitor] REGRESSION — ${result.summary}`);
  for (const f of critical) {
    console.error(`[monitor]   critical: ${f.detail}`);
  }
  // TODO: wire email/Slack here (e.g. reuse lib/email-sender or a webhook).
}

/**
 * Run one tracking-health check for a site.
 *
 * - No previous run  => establish a baseline, store it, return verdict "ok".
 * - Previous exists  => score confidence, diff current vs. previous, alert on
 *                       regression, then ALWAYS store the current run so history
 *                       stays complete.
 *
 * `store` is injectable for testing; defaults to the shared Supabase store.
 */
export async function runMonitorCheck(
  siteUrl: string,
  store: MonitorStore = monitorStore
): Promise<MonitorCheckResult> {
  const audit = await auditExistingSite(siteUrl);
  const current = toMonitorRun(audit, siteUrl);

  const previous = await store.getLatestRun(siteUrl);

  // ─── First run: establish a baseline, no comparison possible ───
  if (!previous) {
    const confidence = scoreCaptureConfidence(current);
    let stored = true;
    try {
      await store.saveRun(current);
    } catch (err) {
      stored = false;
      console.warn("[monitor] failed to store baseline run:", (err as Error)?.message);
    }
    return {
      verdict: "ok",
      confidence: confidence.score,
      findings: [],
      summary: "baseline established — no prior run to compare",
      stored,
    };
  }

  // ─── Subsequent run: score confidence, then diff vs. the previous run ───
  // (diffRuns scores confidence internally too; we call it explicitly here per
  // the orchestration contract and to make the gating obvious at this layer.)
  scoreCaptureConfidence(current, previous);
  const result = diffRuns(current, previous);

  // Always store the current run AFTER diffing so history is complete,
  // regardless of verdict.
  let stored = true;
  try {
    await store.saveRun(current);
  } catch (err) {
    stored = false;
    console.warn("[monitor] failed to store run:", (err as Error)?.message);
  }

  if (result.verdict === "regression") {
    notifyRegression(result);
  }

  return { ...result, stored };
}
