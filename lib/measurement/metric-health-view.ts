// metric-health-view.ts — PURE presentation mapping for the Monitor (Metric
// Health) screen: threshold verdict → ds Badge variant + label, and the overall
// headline tone. No JSX, so node:test can cover it. This is presentation only —
// the verdict itself is computed by data-validation.ts (unchanged).

import type { MetricVerdict } from './data-validation.ts';
import type { BadgeVariant, Verdict } from '@/components/ds/tokens';

// The authoritative threshold verdict → a ds Badge variant. ok = success (green),
// regression = danger (the real problem), inconclusive = neutral (calm, no alarm).
export function verdictBadgeVariant(v: MetricVerdict): BadgeVariant {
  return v === 'ok' ? 'success' : v === 'regression' ? 'danger' : 'neutral';
}

export const verdictLabel: Record<MetricVerdict, string> = {
  regression: 'needs attention',
  inconclusive: 'not enough data',
  ok: 'healthy',
};

export interface OverallTone {
  variant: Verdict; // VerdictBanner tone
  label: string;
  sub: string;
}

// The overall headline tone. Crucially, "not enough history yet" is a CALM
// warning (amber), never an alarming danger — the don't-cry-wolf behavior.
export function overallTone(counts: { regressions: number; healthy: number; total: number }): OverallTone {
  if (counts.regressions > 0) {
    const n = counts.regressions;
    return {
      variant: 'danger',
      label: `${n} event${n === 1 ? '' : 's'} need attention`,
      sub: 'A tracked key event dropped or stopped firing. Investigate before it costs you data.',
    };
  }
  if (counts.total > 0 && counts.healthy === 0) {
    return {
      variant: 'warning',
      label: 'Not enough history yet',
      sub: 'Metric collection is still building a baseline. Re-check in a few days.',
    };
  }
  return {
    variant: 'success',
    label: 'Tracked events are healthy',
    sub: 'No key event dropped past its threshold against the trailing baseline.',
  };
}
