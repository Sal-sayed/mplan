'use client';

// Read-only presentation of metric-health results (the threshold Data Validation
// agent). Verdict-led and action-first, mirroring LaunchReadinessScreen's grammar:
// regressions (key events that dropped / stopped firing) lead; inconclusive
// ("not enough history yet") and ok follow, de-emphasized. Renders exactly what
// /api/metrics/validate returns — no fabricated data.

import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, History, BarChart3 } from 'lucide-react';
import type { MetricHealthEntry, MetricVerdict } from '@/lib/measurement/data-validation';

interface VerdictStyle {
  text: string;
  ring: string;
  bg: string;
  dot: string;
  Icon: typeof CheckCircle2 | null;
  chip: string;
}

// Same palette as the drift/readiness screens: regression≈rose, inconclusive≈
// amber, ok≈emerald.
const VERDICT: Record<MetricVerdict, VerdictStyle> = {
  regression: { text: 'text-rose-300', ring: 'border-rose-500/30', bg: 'bg-rose-500/[0.06]', dot: 'text-rose-400', Icon: AlertCircle, chip: 'bg-rose-500/15 text-rose-300 border-rose-500/20' },
  inconclusive: { text: 'text-amber-300', ring: 'border-amber-500/25', bg: 'bg-amber-500/[0.05]', dot: 'text-amber-400', Icon: AlertTriangle, chip: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  ok: { text: 'text-emerald-300', ring: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.04]', dot: 'text-emerald-400', Icon: CheckCircle2, chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
};

const VERDICT_LABEL: Record<MetricVerdict, string> = {
  regression: 'needs attention',
  inconclusive: 'not enough data',
  ok: 'healthy',
};

// regression (critical first) → inconclusive → ok.
function rank(e: MetricHealthEntry): number {
  if (e.verdict === 'regression') return e.finding?.severity === 'critical' ? 0 : 1;
  if (e.verdict === 'inconclusive') return 2;
  return 3;
}

function EntryRow({ entry }: { entry: MetricHealthEntry }) {
  const v = VERDICT[entry.verdict];
  const Icon = v.Icon;
  return (
    <div className={`rounded-xl border ${v.ring} ${v.bg} p-4`}>
      <div className="flex items-start gap-3">
        {Icon ? <Icon size={18} className={`${v.dot} shrink-0 mt-0.5`} /> : <span className="shrink-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-dashed border-line-strong" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-semibold text-ink font-mono break-all">{entry.eventName}</code>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${v.chip} font-semibold`}>{VERDICT_LABEL[entry.verdict]}</span>
            {entry.finding?.severity === 'critical' && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-semibold">critical</span>
            )}
          </div>
          <p className="text-sm text-faint mt-1">{entry.finding?.detail ?? entry.summary}</p>
        </div>
      </div>
    </div>
  );
}

export default function MetricHealthScreen({
  results,
  propertyChecked,
  onReset,
}: {
  results: MetricHealthEntry[];
  propertyChecked: boolean;
  onReset?: () => void;
}) {
  const sorted = [...results].sort((a, b) => rank(a) - rank(b));
  const regressions = results.filter((r) => r.verdict === 'regression');
  const inconclusive = results.filter((r) => r.verdict === 'inconclusive');
  const healthy = results.filter((r) => r.verdict === 'ok');

  // Overall headline tone.
  const tone: { Icon: typeof CheckCircle2; text: string; ring: string; bg: string; iconBg: string; iconText: string; label: string; sub: string } =
    regressions.length > 0
      ? { Icon: AlertCircle, text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]', iconBg: 'bg-rose-500/20', iconText: 'text-rose-400',
          label: `${regressions.length} event${regressions.length === 1 ? '' : 's'} need attention`, sub: 'A tracked key event dropped or stopped firing. Investigate before it costs you data.' }
      : results.length > 0 && healthy.length === 0
        ? { Icon: AlertTriangle, text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', iconBg: 'bg-amber-500/15', iconText: 'text-amber-400',
            label: 'Not enough history yet', sub: 'Metric collection is still building a baseline. Re-check in a few days.' }
        : { Icon: CheckCircle2, text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400',
            label: 'Tracked events are healthy', sub: 'No key event dropped past its threshold against the trailing baseline.' };
  const TIcon = tone.Icon;

  return (
    <div className="h-full w-full flex flex-col bg-app overflow-hidden">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-line bg-surface z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onReset && (
            <button onClick={onReset} className="p-2 rounded-lg hover:bg-overlay text-faint hover:text-muted transition shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0 flex items-center gap-2">
            <BarChart3 size={16} className="text-cyan-400 shrink-0" />
            <div className="text-sm font-semibold text-ink truncate">Metric health</div>
          </div>
        </div>
      </header>

      <div className="flex-1 scroll-area bg-app">
        <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
          {!propertyChecked ? (
            // No operator + GA4 property → nothing to judge. A quiet note, not an error.
            <div className="rounded-2xl border border-line bg-overlay p-6 flex items-start gap-3">
              <History size={18} className="text-faint shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted">No metric history to check yet</p>
                <p className="text-xs text-faint mt-1">Sign in as the operator and enter your GA4 property ID in the readiness check, with the metric collector running, to validate that your key events keep firing.</p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-2xl border border-line bg-overlay p-6">
              <p className="text-sm text-muted">No key events in this plan to validate.</p>
            </div>
          ) : (
            <>
              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                className={`rounded-2xl border ${tone.ring} ${tone.bg} p-6`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${tone.iconBg} flex items-center justify-center shrink-0`}>
                    <TIcon className={tone.iconText} size={26} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className={`text-2xl font-bold ${tone.text}`}>{tone.label}</h1>
                    <p className="text-faint text-sm mt-0.5">{tone.sub}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-5">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${VERDICT.regression.chip}`}><b>{regressions.length}</b> need attention</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${VERDICT.inconclusive.chip}`}><b>{inconclusive.length}</b> not enough data</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${VERDICT.ok.chip}`}><b>{healthy.length}</b> healthy</span>
                </div>
              </motion.div>

              {/* Action-first: regressions, then inconclusive, then healthy. */}
              <div className="space-y-2.5">
                {sorted.map((e) => <EntryRow key={e.eventName} entry={e} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
