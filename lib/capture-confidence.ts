// capture-confidence.ts
// The trust layer. A monitor's whole value is that people believe its alerts.
// The fastest way to destroy that is to fire a "tracking broke!" alert when in
// fact OUR crawler was blocked. So before any diff is trusted, we score how
// clean the capture itself was. Low confidence => we don't claim a break, we
// say "inconclusive". Honest "I don't know" beats a confident wrong alarm.

import type { MonitorRun, CaptureConfidence, CaptureInfra } from "./monitor-types";

// All tuning knobs in ONE place. These are UNVALIDATED defaults — tune here,
// never inline. Penalties are subtracted from a starting score of 1.0; ratios
// are the fraction-of-baseline floors below which a coverage penalty applies.
export const CONFIDENCE_CONFIG = {
  // A run with score >= threshold AND no hard disqualifier is "trustworthy".
  threshold: 0.7,
  penalties: {
    noGa4: 0.35,
    noGtm: 0.2,
    pageCoverageDrop: 0.25,
    networkVolumeDrop: 0.2,
    interactionFailed: 0.15,
  },
  ratios: {
    // run.pagesCrawled / baseline.pagesCrawled below this => coverage dropped.
    pageCoverageFloor: 0.6,
    // run.totalNetworkRequests / baseline.totalNetworkRequests below this =>
    // the page probably did not fully load.
    networkVolumeFloor: 0.5,
  },
  // Any hard disqualifier caps the score at this ceiling, no matter what else.
  hardDisqualifierCeiling: 0.3,
} as const;

// A run can be DISQUALIFIED outright by hard signals. These mean "we almost
// certainly didn't see the real site", so any missing-event finding is noise.
function disqualifiers(infra: CaptureInfra): string[] {
  const out: string[] = [];
  if (infra.hitChallengePage)
    out.push("Hit a bot-detection / challenge page — we likely never saw the real site.");
  if (infra.consentBlocked)
    out.push("Consent banner was never dismissed — events may be gated, not broken.");
  if (infra.loadErrors > 0)
    out.push(`${infra.loadErrors} page(s) failed to load (non-2xx) — partial capture.`);
  return out;
}

/**
 * Score 0..1 for how much we trust THIS run's event capture, judged partly on
 * its own signals and partly relative to a baseline (so we catch "crawl
 * degraded vs. last time" even when nothing hard-failed).
 *
 * Key asymmetry: seeing the GA4 ID + GTM container is strong positive evidence
 * the page truly rendered and tags initialized. With that confirmed, a missing
 * event is much more likely to be a REAL break than a capture miss.
 */
export function scoreCaptureConfidence(
  run: MonitorRun,
  baseline?: MonitorRun
): CaptureConfidence {
  const { penalties, ratios, threshold, hardDisqualifierCeiling } = CONFIDENCE_CONFIG;
  const reasons: string[] = [];
  const hard = disqualifiers(run.infra);

  let score = 1.0;

  // --- Infrastructure presence (the strongest positive signal) ---
  if (run.infra.ga4MeasurementId) {
    reasons.push(`GA4 ${run.infra.ga4MeasurementId} detected — tag layer initialized.`);
  } else {
    score -= penalties.noGa4;
    reasons.push("No GA4 measurement ID detected — capture or the site itself changed.");
  }

  if (run.infra.gtmContainerIds.length > 0) {
    reasons.push(`GTM container(s) ${run.infra.gtmContainerIds.join(", ")} loaded.`);
  } else {
    score -= penalties.noGtm;
    reasons.push("No GTM container detected this run.");
  }

  // --- Coverage relative to baseline (catches a degraded crawl) ---
  if (baseline) {
    const pageRatio =
      baseline.infra.pagesCrawled > 0
        ? run.infra.pagesCrawled / baseline.infra.pagesCrawled
        : 1;
    const reqRatio =
      baseline.infra.totalNetworkRequests > 0
        ? run.infra.totalNetworkRequests / baseline.infra.totalNetworkRequests
        : 1;

    if (pageRatio < ratios.pageCoverageFloor) {
      score -= penalties.pageCoverageDrop;
      reasons.push(
        `Crawled ${run.infra.pagesCrawled} pages vs. ${baseline.infra.pagesCrawled} last time — coverage dropped.`
      );
    }
    if (reqRatio < ratios.networkVolumeFloor) {
      score -= penalties.networkVolumeDrop;
      reasons.push(
        `Network volume ~${Math.round(reqRatio * 100)}% of baseline — page may not have fully loaded.`
      );
    }
  }

  // --- Interaction engine ---
  if (run.infra.interactionAutomationFailed) {
    score -= penalties.interactionFailed;
    reasons.push("Automated interaction failed — interaction-triggered events may be untested.");
  }

  // Hard disqualifiers floor the score regardless of the above.
  if (hard.length > 0) {
    score = Math.min(score, hardDisqualifierCeiling);
    reasons.unshift(...hard);
  }

  score = Math.max(0, Math.min(1, score));

  const trustworthy = score >= threshold && hard.length === 0;

  return { score: Number(score.toFixed(2)), trustworthy, reasons };
}
