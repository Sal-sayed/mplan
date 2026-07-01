'use client';

// Monitor stage — read-only presentation of metric-health results (the threshold
// Data Validation agent), in the rethemed dark-shell / light-card look. The THRESHOLD
// verdict (ok / regression / inconclusive) is the authoritative signal; the Python
// statistical tier renders BELOW it as a clearly subordinate, "preliminary — not yet
// validated on real data" sub-section. Visual only — same data, same logic, same
// props as before; nothing here fetches or computes a verdict.
//
// NOTE: the props carry only latest-vs-baseline numbers (no per-day time series), so
// there is no trend chart / sparkline here — drawing one would mean inventing data.

import { motion } from 'framer-motion';
import { ArrowLeft, History, Activity, FlaskConical, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MetricHealthEntry } from '@/lib/measurement/data-validation';
import type { MetricAnalysis } from '@/lib/measurement/metric-analysis-store';
import { toPreliminaryView } from '@/lib/measurement/metric-analysis-format';
import { verdictBadgeVariant, verdictLabel, overallTone } from '@/lib/measurement/metric-health-view';
import { Card, Badge, StatTile, VerdictBanner } from '@/components/ds';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;
const round = (n: number) => Math.round(n * 100) / 100;

// regression (critical first) → inconclusive → ok.
function rank(e: MetricHealthEntry): number {
  if (e.verdict === 'regression') return e.finding?.severity === 'critical' ? 0 : 1;
  if (e.verdict === 'inconclusive') return 2;
  return 3;
}

// One number in the per-entry stat strip (a light inline block — NOT a StatTile card,
// to avoid nesting shadowed tiles inside the entry card).
function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ds-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-ds-ink">{value}</div>
      {sub ? <div className="truncate text-[11px] text-ds-muted">{sub}</div> : null}
    </div>
  );
}

// Preliminary statistical tier — DELIBERATELY subordinate: muted, dashed, smaller,
// always labelled "preliminary — not yet validated on real data" with its caveats.
// It sits BELOW the threshold verdict and must never look more authoritative.
function PreliminaryTier({ analysis }: { analysis: MetricAnalysis }) {
  const view = toPreliminaryView(analysis);
  const Trend = TREND_ICON[analysis.trend];
  return (
    <div className="rounded-xl border border-dashed border-ds-line-strong bg-ds-subtle p-3">
      <div className="flex items-center gap-1.5">
        <FlaskConical size={12} className="shrink-0 text-ds-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ds-muted">{view.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ds-secondary">
        <span className="inline-flex items-center gap-1"><Trend size={12} className="text-ds-muted" /> {view.trend}</span>
        <span>{view.changepoint}</span>
        <span className="text-ds-muted">{view.weeks}</span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {view.caveats.map((c) => (
          <li key={c} className="text-[11px] text-ds-muted">· {c}</li>
        ))}
      </ul>
    </div>
  );
}

function EntryCard({ entry, analysis }: { entry: MetricHealthEntry; analysis?: MetricAnalysis }) {
  const f = entry.finding;
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <code className="break-all font-mono text-sm font-bold text-ds-ink">{entry.eventName}</code>
          <p className="mt-1 text-sm text-ds-secondary">{f?.detail ?? entry.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {f?.severity === 'critical' && <Badge variant="danger" dot>critical</Badge>}
          {/* The authoritative threshold verdict. */}
          <Badge variant={verdictBadgeVariant(entry.verdict)} dot>{verdictLabel[entry.verdict]}</Badge>
        </div>
      </div>

      {/* Key numbers, only when a baseline comparison ran. */}
      {f && (
        <div className="grid grid-cols-3 gap-4 rounded-xl border border-ds-line bg-ds-subtle p-4">
          <Stat label="Latest" value={round(f.latestValue)} sub={`on ${f.date}`} />
          <Stat label="Baseline avg" value={round(f.baselineAvg)} />
          <Stat label="Days observed" value={entry.daysObserved} />
        </div>
      )}

      {/* Subordinate, preliminary statistical lens — only when an analysis exists. */}
      {analysis ? <PreliminaryTier analysis={analysis} /> : null}
    </Card>
  );
}

export default function MetricHealthScreen({
  results,
  propertyChecked,
  onReset,
  analyses = [],
}: {
  results: MetricHealthEntry[];
  propertyChecked: boolean;
  onReset?: () => void;
  // Preliminary statistical-tier rows (additive). The key-event series use
  // metricName 'eventCount' with dimensionValue = the event name, so we match by
  // event name. Optional — when absent, nothing extra renders.
  analyses?: MetricAnalysis[];
}) {
  const analysisByEvent = new Map(
    analyses.filter((a) => a.metricName === 'eventCount').map((a) => [a.dimensionValue, a])
  );
  const sorted = [...results].sort((a, b) => rank(a) - rank(b));
  const regressions = results.filter((r) => r.verdict === 'regression');
  const inconclusive = results.filter((r) => r.verdict === 'inconclusive');
  const healthy = results.filter((r) => r.verdict === 'ok');
  const tone = overallTone({ regressions: regressions.length, healthy: healthy.length, total: results.length });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-ds-page text-ds-shell-ink">
      {/* Header — on the dark shell (title in light-shell ink, no white bar). */}
      <header className="z-10 flex shrink-0 items-center gap-3 border-b border-ds-shell-line px-6 py-5 lg:px-8">
        {onReset && (
          <button onClick={onReset} aria-label="Back" className="shrink-0 rounded-lg p-2 text-ds-shell-muted transition hover:bg-white/[0.05] hover:text-ds-shell-ink">
            <ArrowLeft size={18} />
          </button>
        )}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ds-shell-raised text-ds-accent-bright ring-1 ring-inset ring-ds-accent/25">
          <Activity size={17} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold tracking-tight text-ds-shell-ink">Metric health</h1>
          <p className="truncate text-sm text-ds-shell-secondary">Daily checks on whether your key events are still firing.</p>
        </div>
      </header>

      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
          {!propertyChecked ? (
            // No operator + GA4 property → nothing to judge. A quiet note, not an error.
            <Card className="flex items-start gap-3">
              <History size={18} className="mt-0.5 shrink-0 text-ds-muted" />
              <div>
                <p className="text-sm font-semibold text-ds-ink">No metric history to check yet</p>
                <p className="mt-1 text-xs text-ds-secondary">Sign in as the operator and enter your GA4 property ID in the readiness check, with the metric collector running, to validate that your key events keep firing.</p>
              </div>
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <p className="text-sm text-ds-secondary">No key events in this plan to validate.</p>
            </Card>
          ) : (
            <>
              {/* Overall verdict (calm warning for "not enough data", never alarming). */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <VerdictBanner variant={tone.variant} kicker="Overall health" title={tone.label}>{tone.sub}</VerdictBanner>
              </motion.div>

              {/* KPI row — a dark headline tile + the three verdict counts. */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile variant="dark" label="Events tracked" value={results.length} />
                <StatTile label="Need attention" value={regressions.length} />
                <StatTile label="Not enough data" value={inconclusive.length} />
                <StatTile label="Healthy" value={healthy.length} />
              </div>

              {/* Action-first: regressions, then inconclusive, then healthy. */}
              <div className="space-y-4">
                {sorted.map((e) => <EntryCard key={e.eventName} entry={e} analysis={analysisByEvent.get(e.eventName)} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
