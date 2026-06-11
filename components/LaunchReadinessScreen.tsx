'use client';

// Read-only presentation of a LaunchReadinessReport. Decision-led and
// action-first: the go/no-go verdict + approval state headline, then the checks
// that need attention (fail → warn) above the ones that don't (pass → skipped),
// then the captured-vs-planned evidence ONLY when a live capture ran. Renders the
// existing report shape verbatim — no backend/report/gate changes, no new fields.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertCircle, ShieldCheck, Radio, ArrowLeft, ChevronDown } from 'lucide-react';
import type {
  LaunchReadinessReport,
  LaunchObservedEvidence,
  ReadinessCheck,
  CheckStatus,
  LaunchDecision,
} from '@/lib/measurement/launch-readiness';

interface DecisionStyle {
  label: string;
  sub: string;
  Icon: typeof CheckCircle2;
  text: string;
  ring: string;
  bg: string;
  iconBg: string;
  iconText: string;
}

const DECISION: Record<LaunchDecision, DecisionStyle> = {
  go: {
    label: 'Go', sub: 'Ready to launch.', Icon: CheckCircle2,
    text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]',
    iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400',
  },
  go_with_warnings: {
    label: 'Go with warnings', sub: 'Launchable, with items to review first.', Icon: AlertTriangle,
    text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]',
    iconBg: 'bg-amber-500/15', iconText: 'text-amber-400',
  },
  no_go: {
    label: 'No-Go', sub: 'Not ready to launch — the blockers below must be fixed first.', Icon: AlertCircle,
    text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]',
    iconBg: 'bg-rose-500/20', iconText: 'text-rose-400',
  },
};

interface StatusStyle {
  label: string;
  Icon: typeof CheckCircle2 | null;
  dot: string;
  ring: string;
  bg: string;
  chip: string;
}

const STATUS: Record<CheckStatus, StatusStyle> = {
  fail: { label: 'must fix', Icon: AlertCircle, dot: 'text-rose-400', ring: 'border-rose-500/30', bg: 'bg-rose-500/[0.06]', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/20' },
  warn: { label: 'to review', Icon: AlertTriangle, dot: 'text-amber-400', ring: 'border-amber-500/25', bg: 'bg-amber-500/[0.05]', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  pass: { label: 'passing', Icon: CheckCircle2, dot: 'text-emerald-400', ring: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.04]', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  skipped: { label: 'not verified', Icon: null, dot: 'text-slate-500', ring: 'border-white/[0.07]', bg: 'bg-white/[0.02]', chip: 'bg-white/[0.05] text-slate-400 border-white/[0.08]' },
};

function StatusMark({ status }: { status: CheckStatus }) {
  const s = STATUS[status];
  if (s.Icon) {
    const Icon = s.Icon;
    return <Icon size={18} className={`${s.dot} shrink-0 mt-0.5`} />;
  }
  // skipped — a muted dashed marker rather than an icon (it's "not yet run").
  return <span className="shrink-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-dashed border-slate-600" aria-hidden />;
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const s = STATUS[check.status];
  return (
    <div className={`rounded-xl border ${s.ring} ${s.bg} p-4`}>
      <div className="flex items-start gap-3">
        <StatusMark status={check.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{check.name}</span>
            {check.blocking && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-semibold">blocking</span>
            )}
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">{check.category}</span>
            {check.status === 'skipped' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500">needs {check.dependsOn}</span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">{check.summary}</p>
          {check.evidence && check.evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {check.evidence.map((e, i) => (
                <li key={i} className="text-xs text-slate-500 font-mono break-words">· {e}</li>
              ))}
            </ul>
          )}
          {check.remediation && (
            <p className="text-xs text-slate-300 mt-2">
              <span className="text-slate-500">Fix: </span>{check.remediation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckGroup({ title, hint, status, checks, defaultOpen }: { title: string; hint?: string; status: CheckStatus; checks: ReadinessCheck[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (checks.length === 0) return null;
  const chip = STATUS[status].chip;
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${chip} font-medium`}>{checks.length}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2.5">
          {hint && <p className="text-xs text-slate-500 -mt-1 mb-1">{hint}</p>}
          {checks.map((c) => <CheckRow key={c.id} check={c} />)}
        </div>
      )}
    </div>
  );
}

const PILL_TONE: Record<CheckStatus, string> = {
  fail: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  warn: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  pass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  skipped: 'bg-white/[0.04] text-slate-400 border-white/[0.08]',
};

function CountPill({ n, status }: { n: number; status: CheckStatus }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${PILL_TONE[status]}`}>
      <b className="font-semibold">{n}</b> {STATUS[status].label}
    </span>
  );
}

function yesNoUnknown(v: boolean | null): string {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return 'unknown';
}

function ObservedEvidence({ observed }: { observed: LaunchObservedEvidence }) {
  const { summary, events } = observed;
  const sorted = [...events].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const stats: Array<[string, string | number]> = [
    ['Raw hits', summary.rawHitCount ?? '—'],
    ['Events seen', summary.totalObservedEvents],
    ['Matched plan', summary.matchedObservedEvents],
    ['Unplanned', summary.unplannedObservedEvents.length],
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">What actually fired</h3>
        <span className="text-xs text-slate-500">captured from the deployed site</span>
      </div>

      <div className="bg-white/[0.04] rounded-2xl border border-white/[0.08] p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-white/[0.03] rounded-lg border border-white/[0.05] p-3 text-center">
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] text-slate-400 border border-white/[0.06]">
            consent banner: <span className="text-slate-300">{yesNoUnknown(summary.consentBannerDetected)}</span>
          </span>
          <span className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] text-slate-400 border border-white/[0.06]">
            accepted: <span className="text-slate-300">{yesNoUnknown(summary.consentAccepted)}</span>
          </span>
        </div>

        {sorted.length > 0 ? (
          <div className="rounded-lg overflow-hidden border border-white/[0.06]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Event</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Vendor</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium hidden sm:table-cell">Destination</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => (
                  <tr key={`${e.name}-${e.vendor ?? ''}-${i}`} className="border-t border-white/[0.04]">
                    <td className="px-3 py-1.5 text-cyan-300 font-mono break-all">{e.name}</td>
                    <td className="px-3 py-1.5 text-slate-300">{e.vendor ?? '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 font-mono hidden sm:table-cell break-all">{e.destinationId ?? '—'}</td>
                    <td className="px-3 py-1.5 text-slate-400 text-right">{e.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No tracking events were captured.</p>
        )}

        {summary.unplannedObservedEvents.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Fired but not in the plan</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.unplannedObservedEvents.map((name) => (
                <code key={name} className="text-[11px] text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06] font-mono break-all">{name}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LaunchReadinessScreen({ report, onReset }: { report: LaunchReadinessReport; onReset?: () => void }) {
  const d = DECISION[report.decision];
  const DIcon = d.Icon;

  const fails = report.checks.filter((c) => c.status === 'fail');
  const warns = report.checks.filter((c) => c.status === 'warn');
  const passes = report.checks.filter((c) => c.status === 'pass');
  const skips = report.checks.filter((c) => c.status === 'skipped');
  // Split "not verified" by what each check is actually waiting on, so it's clear
  // WHY it couldn't run (a Google sign-in vs a deployed URL) rather than a vague pile.
  const needsGoogle = skips.filter((c) => c.dependsOn === 'ga4_oauth' || c.dependsOn === 'gtm_oauth');
  const needsUrl = skips.filter((c) => c.dependsOn === 'deployed_site');
  const otherSkips = skips.filter((c) => c.dependsOn !== 'ga4_oauth' && c.dependsOn !== 'gtm_oauth' && c.dependsOn !== 'deployed_site');

  return (
    <div className="h-full w-full flex flex-col bg-[#0b1120] overflow-hidden">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#0d1525] z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onReset && (
            <button onClick={onReset} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">Launch Readiness</div>
            <div className="text-xs text-slate-400 truncate">{report.meta.url}</div>
          </div>
        </div>
      </header>

      <div className="flex-1 scroll-area bg-[#0b1120]">
        <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
          {/* 1 — Decision headline */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className={`rounded-2xl border ${d.ring} ${d.bg} p-6`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl ${d.iconBg} flex items-center justify-center shrink-0`}>
                <DIcon className={d.iconText} size={26} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className={`text-2xl font-bold ${d.text}`}>{d.label}</h1>
                <p className="text-slate-400 text-sm mt-0.5">{d.sub}</p>
                <div className="flex items-center gap-2 mt-3">
                  <ShieldCheck size={14} className={report.approval.required ? 'text-amber-400' : 'text-emerald-400'} />
                  <span className="text-xs text-slate-300">
                    {report.approval.required ? 'Human approval required before launch' : 'No approval gate'}
                    {report.approval.approvedBy ? ` · approved by ${report.approval.approvedBy}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <CountPill n={fails.length} status="fail" />
              <CountPill n={warns.length} status="warn" />
              <CountPill n={passes.length} status="pass" />
              <CountPill n={skips.length} status="skipped" />
            </div>
          </motion.div>

          {/* 2 — Action-first: blockers, then warnings, then passes, then skipped */}
          <CheckGroup title="Must fix before launch" status="fail" checks={fails} defaultOpen />
          <CheckGroup title="Review" status="warn" checks={warns} defaultOpen />
          <CheckGroup title="Passing" status="pass" checks={passes} defaultOpen />
          <CheckGroup
            title="Needs Google connection"
            hint="These verify your live GA4 property and GTM container. They need a one-time, read-only Google sign-in — coming soon."
            status="skipped" checks={needsGoogle} defaultOpen={false}
          />
          <CheckGroup
            title="Needs a deployed URL"
            hint="Re-run the check with a staging/live URL where GA4/GTM is installed to capture what actually fires."
            status="skipped" checks={needsUrl} defaultOpen={false}
          />
          <CheckGroup title="Not yet verified" status="skipped" checks={otherSkips} defaultOpen={false} />

          {/* 3 — Evidence, only when a live capture ran */}
          {report.observed && <ObservedEvidence observed={report.observed} />}
        </div>
      </div>
    </div>
  );
}
