// metric-analysis-format.ts — PURE presentation helpers for the preliminary
// statistical tier (no JSX, so node:test can cover them). The whole point is
// HONESTY: every view carries the "preliminary — not yet validated on real data"
// label and the caveats, and there is no code path that drops them. The UI uses
// this to render a subordinate, clearly-non-authoritative block next to the fast
// threshold verdict — it must NEVER look more trustworthy than that check.

import type { MetricAnalysis } from './metric-analysis-store.ts';

// The fixed, non-negotiable label. Surfaced verbatim in the UI.
export const STATISTICAL_TIER_LABEL = 'Statistical tier · preliminary — not yet validated on real data';
export const NOT_VALIDATED_NOTE = 'Preliminary — not yet validated on real data.';

export function formatTrend(a: MetricAnalysis): string {
  if (a.trend === 'up') return 'Trend: rising';
  if (a.trend === 'down') return 'Trend: falling';
  return 'Trend: flat';
}

export function formatChangepoint(a: MetricAnalysis): string {
  return a.changepointDetected && a.changepointDate
    ? `Possible shift around ${a.changepointDate}`
    : 'No clear shift detected';
}

export function formatWeeks(a: MetricAnalysis): string {
  const w = a.weeksOfData;
  return `${w} week${w === 1 ? '' : 's'} of data`;
}

export interface PreliminaryView {
  label: string;
  note: string;
  trend: string;
  changepoint: string;
  weeks: string;
  caveats: string[];
  validated: boolean; // always false this slice — surfaced so the UI can assert it
}

// Build the display model. ALWAYS includes the label, the not-validated note, and
// the caveats — regardless of the analysis content — so the tier can never be
// presented as a trustworthy verdict. A standing day-of-week caveat is guaranteed
// even if the stored caveats were somehow empty.
export function toPreliminaryView(a: MetricAnalysis): PreliminaryView {
  const caveats = a.caveats.length > 0 ? a.caveats : ['day-of-week effects not modelled'];
  return {
    label: STATISTICAL_TIER_LABEL,
    note: NOT_VALIDATED_NOTE,
    trend: formatTrend(a),
    changepoint: formatChangepoint(a),
    weeks: formatWeeks(a),
    caveats,
    validated: false, // hard-capped — this slice never presents a validated verdict
  };
}
