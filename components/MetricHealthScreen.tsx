'use client';

// Monitor stage — read-only presentation of metric-health results (the threshold
// Data Validation agent), in the enterprise design-system look. The THRESHOLD
// verdict (ok / regression / inconclusive) is the authoritative signal; the Python
// statistical tier renders BELOW it as a clearly subordinate, "preliminary — not
// yet validated on real data" sub-section. Visual only — same data, same logic,
// same props as before; nothing here fetches or computes a verdict.

import { motion } from 'framer-motion';
import { ArrowLeft, History, BarChart3, FlaskConical, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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

// Preliminary statistical tier — DELIBERATELY subordinate: muted, dashed, smaller,
// always labelled "preliminary — not yet validated on real data" with its caveats.
// It sits BELOW the threshold verdict and must never look more authoritative.
function PreliminaryTier({ analysis }: { analysis: MetricAnalysis }) {
  const view = toPreliminaryView(analysis);
  const Trend = TREND_ICON[analysis.trend];
  return (
    <div className="rounded-lg border border-dashed border-ds-line-strong bg-ds-panel/60 p-3">
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
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <code className="break-all font-mono text-sm font-semibold text-ds-ink">{entry.eventName}</code>
          <p className="mt-1 text-sm text-ds-secondary">{f?.detail ?? entry.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {f?.severity === 'critical' && <Badge variant="danger">critical</Badge>}
          {/* The authoritative threshold verdict. */}
          <Badge variant={verdictBadgeVariant(entry.verdict)}>{verdictLabel[entry.verdict]}</Badge>
        </div>
      </div>

      {/* Key numbers, only when a baseline comparison ran. */}
      {f && (
        <div className="grid grid-cols-2 gap-4 rounded-ds border border-ds-line bg-ds-panel p-4 sm:grid-cols-3">
          <StatTile label="Latest" value={round(f.latestValue)} hint={`on ${f.date}`} />
          <StatTile label="Baseline avg" value={round(f.baselineAvg)} />
          <StatTile label="Days observed" value={entry.daysObserved} />
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
    <div className="flex h-full w-full flex-col overflow-hidden bg-ds-page">
      <header className="z-10 flex h-16 shrink-0 items-center gap-3 border-b border-ds-line bg-ds-card px-4 lg:px-6">
        {onReset && (
          <button onClick={onReset} aria-label="Back" className="shrink-0 rounded-lg p-2 text-ds-muted transition hover:bg-ds-panel hover:text-ds-secondary">
            <ArrowLeft size={18} />
          </button>
        )}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
          <BarChart3 size={16} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ds-ink">Metric health</div>
          <div className="truncate text-xs text-ds-secondary">Daily checks on whether your key events are still firing.</div>
        </div>
      </header>

      <div className="scroll-area flex-1 bg-ds-page">
        <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
          {!propertyChecked ? (
            // No operator + GA4 property → nothing to judge. A quiet note, not an error.
            <Card className="flex items-start gap-3">
              <History size={18} className="mt-0.5 shrink-0 text-ds-muted" />
              <div>
                <p className="text-sm font-medium text-ds-ink">No metric history to check yet</p>
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
                <VerdictBanner variant={tone.variant} title={tone.label}>{tone.sub}</VerdictBanner>
              </motion.div>

              {/* Counts */}
              <Card>
                <div className="grid grid-cols-3 gap-4">
                  <StatTile label="Need attention" value={regressions.length} />
                  <StatTile label="Not enough data" value={inconclusive.length} />
                  <StatTile label="Healthy" value={healthy.length} />
                </div>
              </Card>

              {/* Action-first: regressions, then inconclusive, then healthy. */}
              <div className="space-y-3">
                {sorted.map((e) => <EntryCard key={e.eventName} entry={e} analysis={analysisByEvent.get(e.eventName)} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
