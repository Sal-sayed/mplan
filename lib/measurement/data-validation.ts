// data-validation.ts — threshold Data Validation agent (pure Node, NO statistics).
//
// Reads metric history and applies SIMPLE THRESHOLD logic only: the latest day's
// value vs a trailing average. It emits findings in the SAME 3-state + severity
// grammar as governance-diff:
//
//   ok           — the metric held steady (within threshold).
//   regression   — a CONFIRMED drop: the latest value fell > dropThreshold below
//                  the trailing average, or a metric that was firing went to 0.
//   inconclusive — LOAD-BEARING GATE: not enough history yet to judge. We refuse
//                  to call a drop without a baseline. "Don't cry wolf without
//                  enough data" — analogous to a 'skipped' check in governance.
//
// Deliberately NOT here: z-score, seasonality, changepoint — those are the
// deferred Python statistical tier. Threshold math only; no stats library.

import { getMetricHistory, type Ga4MetricDaily, type MetricHistoryQuery } from './metric-store.ts';

export type MetricVerdict = 'ok' | 'regression' | 'inconclusive';
export type MetricSeverity = 'critical' | 'warning' | 'info';

export interface MetricFinding {
  kind: 'zero_fire' | 'dropped';
  metricName: string;
  dimensionValue?: string;
  severity: MetricSeverity;
  date: string; // the latest day judged
  latestValue: number;
  baselineAvg: number;
  detail: string;
}

export interface MetricValidationResult {
  verdict: MetricVerdict;
  finding?: MetricFinding;
  daysObserved: number;
  summary: string;
}

// A validation result tagged with the event it's for — what the validate
// endpoint returns per key event and what the metric-health UI renders.
export interface MetricHealthEntry extends MetricValidationResult {
  eventName: string;
}

export interface ValidateOptions {
  // Fraction below the trailing average that counts as a drop. 0.5 = a 50% fall.
  dropThreshold?: number;
  // Minimum total days of history (latest + trailing) required to judge at all.
  // Below this → inconclusive, never a false regression.
  minHistoryDays?: number;
  // How many prior days form the trailing baseline average.
  windowDays?: number;
  // Inclusive lower date bound passed through to the history query.
  sinceDate?: string;
}

const DEFAULTS = { dropThreshold: 0.5, minHistoryDays: 4, windowDays: 7 } as const;

export interface MetricTarget {
  userId: string; // REQUIRED owner scope (Stage 3) — history is read for one user
  propertyId: string;
  metricName: string;
  dimensionValue?: string;
}

// getHistory is injectable (the DI seam the gate uses) so this stays pure and
// testable without a store/Supabase; defaults to the real metric-store reader.
export async function validateMetrics(
  target: MetricTarget,
  opts: ValidateOptions = {},
  getHistory: (q: MetricHistoryQuery) => Promise<Ga4MetricDaily[]> = getMetricHistory
): Promise<MetricValidationResult> {
  const dropThreshold = opts.dropThreshold ?? DEFAULTS.dropThreshold;
  const minHistoryDays = opts.minHistoryDays ?? DEFAULTS.minHistoryDays;
  const windowDays = opts.windowDays ?? DEFAULTS.windowDays;

  const history = await getHistory({
    userId: target.userId,
    propertyId: target.propertyId,
    metricName: target.metricName,
    dimensionValue: target.dimensionValue,
    sinceDate: opts.sinceDate,
  });
  const daysObserved = history.length;

  // GATE: too little history to judge → inconclusive, never a false regression.
  if (daysObserved < minHistoryDays) {
    return {
      verdict: 'inconclusive',
      daysObserved,
      summary: `Only ${daysObserved} day(s) of history for ${label(target)} — need ${minHistoryDays} to judge. Inconclusive, not a break.`,
    };
  }

  // History is date-ascending; latest is the tail, baseline is the prior window.
  const latest = history[history.length - 1];
  const trailing = history.slice(Math.max(0, history.length - 1 - windowDays), history.length - 1);
  const baselineAvg = trailing.reduce((s, m) => s + m.value, 0) / trailing.length;

  // Zero-fire: it was firing (baseline > 0) and dropped to exactly 0 today. The
  // loudest failure mode — a key event that stopped entirely.
  if (latest.value === 0 && baselineAvg > 0) {
    return {
      verdict: 'regression',
      daysObserved,
      finding: {
        kind: 'zero_fire',
        metricName: target.metricName,
        dimensionValue: target.dimensionValue,
        severity: 'critical',
        date: latest.date,
        latestValue: 0,
        baselineAvg,
        detail: `${label(target)} fired 0 on ${latest.date} after averaging ${round(baselineAvg)} over the prior ${trailing.length} day(s).`,
      },
      summary: `${label(target)} stopped firing on ${latest.date}.`,
    };
  }

  // Drop: a real baseline to fall from, and the latest fell past the threshold.
  if (baselineAvg > 0 && latest.value < baselineAvg * (1 - dropThreshold)) {
    const dropPct = Math.round((1 - latest.value / baselineAvg) * 100);
    return {
      verdict: 'regression',
      daysObserved,
      finding: {
        kind: 'dropped',
        metricName: target.metricName,
        dimensionValue: target.dimensionValue,
        severity: 'warning',
        date: latest.date,
        latestValue: latest.value,
        baselineAvg,
        detail: `${label(target)} dropped ${dropPct}% on ${latest.date} (${round(latest.value)} vs a ${round(baselineAvg)} trailing average).`,
      },
      summary: `${label(target)} dropped ${dropPct}% vs its trailing average.`,
    };
  }

  return {
    verdict: 'ok',
    daysObserved,
    summary: `${label(target)} is steady (${round(latest.value)} on ${latest.date} vs a ${round(baselineAvg)} trailing average).`,
  };
}

function label(t: MetricTarget): string {
  return t.dimensionValue ? `${t.metricName}/${t.dimensionValue}` : t.metricName;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
