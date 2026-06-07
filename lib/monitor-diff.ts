// monitor-diff.ts
// The core: compare the current run to the previous baseline and produce a
// verdict. Two design rules drive everything:
//
//   1. Three states, not two. "ok" / "regression" / "inconclusive". The third
//      is what makes the monitor trustworthy: when capture confidence is low we
//      REFUSE to claim a break. Silence beats a false alarm.
//
//   2. A finding's severity = (did it diverge) x (does it matter for this
//      business model). A dropped `info` event isn't an alert; a dropped
//      `critical` conversion event is.

import type { CapturedEvent, MonitorRun } from "./monitor-types";
import { scoreCaptureConfidence } from "./capture-confidence";
import { severityForEvent, type Severity } from "./materiality";

export type Verdict = "ok" | "regression" | "inconclusive";

export interface Finding {
  kind:
    | "event_disappeared"
    | "event_degraded"
    | "event_appeared"
    | "params_changed"
    | "infra_changed";
  event?: string;
  severity: Severity;
  detail: string;
}

export interface DiffResult {
  verdict: Verdict;
  confidence: number; // current run's capture confidence
  findings: Finding[];
  summary: string;
}

// Tuning for the partial-degradation (pagesFiredOn ratio) signal. This is what
// the coverage proxy buys us: catching an event that is still firing but on far
// fewer pages than before — an early warning before it hits zero. Tune here.
export const DIFF_CONFIG = {
  degradation: {
    // current.pagesFiredOn / baseline.pagesFiredOn below this => degradation.
    ratioFloor: 0.5,
    // Only flag degradation when the baseline had at least this much coverage,
    // so we don't raise noise on naturally low-volume events (e.g. 2 -> 1).
    minBaselinePagesFiredOn: 5,
  },
} as const;

function indexEvents(events: CapturedEvent[]): Map<string, CapturedEvent> {
  // Key on name+source so a GTM-container declaration and a live GA4 hit are
  // tracked separately — "declared but no longer firing" is a real failure mode.
  return new Map(events.map((e) => [`${e.source}:${e.name}`, e]));
}

export function diffRuns(current: MonitorRun, baseline: MonitorRun): DiffResult {
  const confidence = scoreCaptureConfidence(current, baseline);
  const model = current.businessModel;
  const findings: Finding[] = [];

  const prev = indexEvents(baseline.events);
  const now = indexEvents(current.events);

  // Disappeared / stopped firing.
  for (const [key, before] of prev) {
    const after = now.get(key);
    const stillFiring = after && after.pagesFiredOn > 0;
    if (!stillFiring) {
      const wasFiring = before.pagesFiredOn > 0;
      if (!wasFiring) continue; // it was already dead at baseline; not a new regression
      findings.push({
        kind: "event_disappeared",
        event: before.name,
        severity: severityForEvent(before.name, model),
        detail: after
          ? `${before.name} (${before.source}) is declared but stopped firing (${before.pagesFiredOn} → 0 pages).`
          : `${before.name} (${before.source}) was firing and is now absent entirely.`,
      });
    } else {
      // Both firing — two checks:
      // (a) partial degradation: still firing, but on far fewer pages than
      //     before. The pages-fired-on proxy turns this into an early warning
      //     instead of waiting for a full disappearance.
      const { ratioFloor, minBaselinePagesFiredOn } = DIFF_CONFIG.degradation;
      if (
        before.pagesFiredOn >= minBaselinePagesFiredOn &&
        after!.pagesFiredOn / before.pagesFiredOn < ratioFloor
      ) {
        findings.push({
          kind: "event_degraded",
          event: before.name,
          severity: severityForEvent(before.name, model),
          detail: `${before.name} (${before.source}) firing on far fewer pages (${before.pagesFiredOn} → ${after!.pagesFiredOn}).`,
        });
      }

      // (b) lost parameters (e.g. transaction_id dropped).
      const lost = before.paramKeys.filter((k) => !after!.paramKeys.includes(k));
      if (lost.length > 0) {
        findings.push({
          kind: "params_changed",
          event: before.name,
          severity: severityForEvent(before.name, model),
          detail: `${before.name} lost parameter(s): ${lost.join(", ")}.`,
        });
      }
    }
  }

  // Newly appeared — usually intentional, never alarmed, but logged.
  for (const [key, after] of now) {
    if (!prev.has(key) && after.pagesFiredOn > 0) {
      findings.push({
        kind: "event_appeared",
        event: after.name,
        severity: "info",
        detail: `New event ${after.name} (${after.source}) is now firing.`,
      });
    }
  }

  // Infra-level changes worth noting.
  if (baseline.infra.ga4MeasurementId && !current.infra.ga4MeasurementId) {
    findings.push({
      kind: "infra_changed",
      severity: "critical",
      detail: `GA4 ${baseline.infra.ga4MeasurementId} no longer detected.`,
    });
  }

  // --- Verdict, gated by confidence ---
  const hasCritical = findings.some(
    (f) => f.severity === "critical" && f.kind !== "event_appeared"
  );
  const hasWarning = findings.some(
    (f) => f.severity === "warning" && f.kind !== "event_appeared"
  );
  const hasRealDivergence = hasCritical || hasWarning;

  let verdict: Verdict;
  let summary: string;

  if (hasRealDivergence && !confidence.trustworthy) {
    // The crucial case: we see a divergence BUT we don't trust the capture.
    // We refuse to call it a break. This is the line that protects trust.
    verdict = "inconclusive";
    summary =
      `Possible change detected, but this run's capture wasn't clean enough to confirm ` +
      `(confidence ${confidence.score}). Not raising an alert. Reason: ${confidence.reasons[0]}`;
  } else if (hasRealDivergence) {
    verdict = "regression";
    const top = findings.find((f) => f.severity === "critical") ?? findings.find((f) => f.severity === "warning");
    summary = `Tracking regression on a ${model} site: ${top?.detail}`;
  } else if (!confidence.trustworthy) {
    verdict = "inconclusive";
    summary = `No clear break, but capture confidence is low (${confidence.score}); treat this run as unverified.`;
  } else {
    verdict = "ok";
    summary = `No material tracking changes. Capture confidence ${confidence.score}.`;
  }

  return { verdict, confidence: confidence.score, findings, summary };
}
