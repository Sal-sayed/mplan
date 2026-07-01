'use client';

// Read-only presentation of a LaunchReadinessReport. Decision-led and
// action-first: the go/no-go verdict + approval state headline, then the checks
// that need attention (fail → warn) above the ones that don't (pass → skipped),
// then the captured-vs-planned evidence ONLY when a live capture ran. Renders the
// existing report shape verbatim — no backend/report/gate changes, no new fields.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertCircle, ShieldCheck, Radio, ArrowLeft, ArrowRight, ChevronDown, History } from 'lucide-react';
import type {
  LaunchReadinessReport,
  LaunchObservedEvidence,
  ReadinessCheck,
  CheckStatus,
  LaunchDecision,
} from '@/lib/measurement/launch-readiness';
import type { ConsentComplianceResult, ConsentVerdict } from '@/lib/measurement/consent-compliance';
import type { GovernanceDrift, DriftVerdict } from '@/lib/measurement/governance-diff';

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
  skipped: { label: 'not verified', Icon: null, dot: 'text-ds-secondary', ring: 'border-ds-line', bg: 'bg-ds-card', chip: 'bg-ds-card text-ds-secondary border-ds-line' },
};

function StatusMark({ status }: { status: CheckStatus }) {
  const s = STATUS[status];
  if (s.Icon) {
    const Icon = s.Icon;
    return <Icon size={18} className={`${s.dot} shrink-0 mt-0.5`} />;
  }
  // skipped — a muted dashed marker rather than an icon (it's "not yet run").
  return <span className="shrink-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-dashed border-ds-line-strong" aria-hidden />;
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const s = STATUS[check.status];
  return (
    <div className={`rounded-xl border ${s.ring} ${s.bg} p-4`}>
      <div className="flex items-start gap-3">
        <StatusMark status={check.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ds-ink">{check.name}</span>
            {check.blocking && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-semibold">blocking</span>
            )}
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-ds-card text-ds-secondary">{check.category}</span>
            {check.status === 'skipped' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ds-card text-ds-secondary">needs {check.dependsOn}</span>
            )}
          </div>
          <p className="text-sm text-ds-secondary mt-1">{check.summary}</p>
          {check.evidence && check.evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {check.evidence.map((e, i) => (
                <li key={i} className="text-xs text-ds-secondary font-mono break-words">· {e}</li>
              ))}
            </ul>
          )}
          {check.remediation && (
            <p className="text-xs text-ds-secondary mt-2">
              <span className="text-ds-secondary">Fix: </span>{check.remediation}
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
          <h3 className="text-sm font-semibold text-ds-ink">{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${chip} font-medium`}>{checks.length}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-ds-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2.5">
          {hint && <p className="text-xs text-ds-secondary -mt-1 mb-1">{hint}</p>}
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
  skipped: 'bg-ds-card text-ds-secondary border-ds-line',
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
        <Radio className="w-4 h-4 text-ds-accent-text" />
        <h3 className="text-sm font-semibold text-ds-ink">What actually fired</h3>
        <span className="text-xs text-ds-secondary">captured from the deployed site</span>
      </div>

      <div className="bg-ds-card rounded-2xl border border-ds-line p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-ds-card rounded-lg border border-ds-line p-3 text-center">
              <p className="text-xl font-bold text-ds-ink">{value}</p>
              <p className="text-[11px] text-ds-secondary mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-[11px] px-2 py-1 rounded-md bg-ds-card text-ds-secondary border border-ds-line">
            consent banner: <span className="text-ds-secondary">{yesNoUnknown(summary.consentBannerDetected)}</span>
          </span>
          <span className="text-[11px] px-2 py-1 rounded-md bg-ds-card text-ds-secondary border border-ds-line">
            accepted: <span className="text-ds-secondary">{yesNoUnknown(summary.consentAccepted)}</span>
          </span>
        </div>

        {sorted.length > 0 ? (
          <div className="rounded-lg overflow-hidden border border-ds-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-ds-card">
                  <th className="text-left px-3 py-2 text-ds-secondary font-medium">Event</th>
                  <th className="text-left px-3 py-2 text-ds-secondary font-medium">Vendor</th>
                  <th className="text-left px-3 py-2 text-ds-secondary font-medium hidden sm:table-cell">Destination</th>
                  <th className="text-right px-3 py-2 text-ds-secondary font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => (
                  <tr key={`${e.name}-${e.vendor ?? ''}-${i}`} className="border-t border-ds-line">
                    <td className="px-3 py-1.5 text-ds-accent-text font-mono break-all">{e.name}</td>
                    <td className="px-3 py-1.5 text-ds-secondary">{e.vendor ?? '—'}</td>
                    <td className="px-3 py-1.5 text-ds-secondary font-mono hidden sm:table-cell break-all">{e.destinationId ?? '—'}</td>
                    <td className="px-3 py-1.5 text-ds-secondary text-right">{e.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ds-secondary">No tracking events were captured.</p>
        )}

        {summary.unplannedObservedEvents.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-ds-secondary uppercase tracking-widest mb-2">Fired but not in the plan</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.unplannedObservedEvents.map((name) => (
                <code key={name} className="text-[11px] text-ds-secondary bg-ds-card px-2 py-0.5 rounded border border-ds-line font-mono break-all">{name}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Consent compliance (slice 1: Consent Mode Verification) ───

const CONSENT_VERDICT: Record<ConsentVerdict, { label: string; text: string; ring: string; bg: string; Icon: typeof CheckCircle2 }> = {
  pass: { label: 'Consent compliant', text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]', Icon: CheckCircle2 },
  warn: { label: 'Consent — review', text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', Icon: AlertTriangle },
  fail: { label: 'Consent — not compliant', text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]', Icon: AlertCircle },
  inconclusive: { label: 'Consent — not verified', text: 'text-ds-secondary', ring: 'border-ds-line', bg: 'bg-ds-card', Icon: ShieldCheck },
};

// One present/absent indicator row (mirrors the audit Consent Management panel).
function ConsentSignalRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`text-base mt-0.5 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{ok ? '✓' : '⚠'}</span>
      <div>
        <div className="text-sm text-ds-secondary font-medium">{label}</div>
        <div className="text-xs text-ds-secondary mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function ConsentCompliancePanel({ consent }: { consent: ConsentComplianceResult }) {
  const v = CONSENT_VERDICT[consent.verdict];
  const VIcon = v.Icon;
  const required = consent.consentModeRequired;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
      className={`rounded-2xl border ${v.ring} ${v.bg} p-5`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl bg-ds-card flex items-center justify-center shrink-0`}>
          <VIcon className={v.text} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-ds-secondary" />
            <span className="text-[11px] uppercase tracking-widest text-ds-secondary font-semibold">Consent &amp; compliance</span>
          </div>
          <h2 className={`text-lg font-bold ${v.text} mt-0.5`}>{v.label}</h2>
          <p className="text-ds-secondary text-sm mt-0.5">{consent.summary}</p>
        </div>
      </div>

      {/* Signal grid — what the page actually showed. */}
      <div className="mt-4 pt-4 border-t border-ds-line grid sm:grid-cols-2 gap-3">
        <ConsentSignalRow
          ok={consent.consentModePresent}
          label="Google Consent Mode"
          detail={
            consent.captured
              ? consent.consentModePresent
                ? `Present — default ${consent.hasDefault ? '✓' : '✗'}, update ${consent.hasUpdate ? '✓' : '✗'}`
                : 'No consent default/update signals found on the page'
              : 'Not verified — needs a deployed URL'
          }
        />
        <ConsentSignalRow
          ok={consent.consentModeV2}
          label="Consent Mode v2"
          detail={consent.consentModeV2 ? 'ad_user_data / ad_personalization present' : 'v2 ad_* signals not found'}
        />
        <ConsentSignalRow
          ok={consent.bannerDetected === true}
          label="Consent banner / CMP"
          detail={
            consent.bannerDetected === true
              ? `Detected${consent.cmp ? ` (${consent.cmp})` : ''}${consent.bannerAccepted ? ' — accepted' : ''}`
              : consent.bannerDetected === false
                ? 'No consent banner detected'
                : 'Banner state unknown'
          }
        />
        <ConsentSignalRow
          ok={!required || consent.consentModePresent}
          label="Required by plan"
          detail={required ? 'Plan requires Consent Mode' : 'Plan does not require Consent Mode'}
        />
      </div>

      {/* Pre-consent tracking (slice 2): did anything fire BEFORE the user agreed? */}
      <div className="mt-4 pt-4 border-t border-ds-line">
        <div className="flex items-center gap-1.5 mb-2">
          <Radio size={13} className="text-ds-secondary" />
          <span className="text-[11px] uppercase tracking-widest text-ds-secondary font-semibold">Pre-consent tracking</span>
        </div>
        {!consent.preConsentChecked ? (
          <p className="text-sm text-ds-secondary">Not verified — needs a deployed URL to observe the pre-consent window.</p>
        ) : !consent.preConsentTracking ? (
          <div className="flex items-start gap-3">
            <span className="text-base mt-0.5 text-emerald-400">✓</span>
            <div className="text-sm text-ds-secondary">No tracking fired before consent was granted — compliant.</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-base mt-0.5 text-rose-400">✕</span>
              <div className="text-sm text-ds-secondary">
                {consent.preConsentHitCount} tracking hit(s) fired <span className="font-semibold">before</span> consent was granted — this tracks users before they agree.
              </div>
            </div>
            {consent.preConsentEventNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-7">
                {consent.preConsentEventNames.map((name) => (
                  <code key={name} className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded font-mono break-all">{name}</code>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issues — plain-English, severity-ordered. */}
      {consent.issues.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-ds-secondary mb-2">Issues</p>
          <ul className="space-y-1.5">
            {consent.issues.map((iss, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`text-xs mt-0.5 ${iss.severity === 'fail' ? 'text-rose-400' : 'text-amber-400'}`}>
                  {iss.severity === 'fail' ? '✕' : '⚠'}
                </span>
                <span className="text-ds-secondary">{iss.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// ─── Drift (governance run-to-run) ───

interface VerdictStyle {
  label: string;
  Icon: typeof CheckCircle2;
  text: string;
  ring: string;
  bg: string;
  iconBg: string;
  iconText: string;
}

// Mirrors the decision palette so the run-to-run verdict reads with the same
// visual grammar as the go/no-go headline: regression ≈ no_go (rose),
// inconclusive ≈ go_with_warnings (amber), ok ≈ go (emerald).
const VERDICT: Record<DriftVerdict, VerdictStyle> = {
  regression: {
    label: 'Regression since last run', Icon: AlertCircle,
    text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]',
    iconBg: 'bg-rose-500/20', iconText: 'text-rose-400',
  },
  inconclusive: {
    label: 'Inconclusive', Icon: AlertTriangle,
    text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]',
    iconBg: 'bg-amber-500/15', iconText: 'text-amber-400',
  },
  ok: {
    label: 'No change since last run', Icon: CheckCircle2,
    text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]',
    iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400',
  },
};

function StatusTag({ status }: { status: CheckStatus }) {
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-semibold ${STATUS[status].chip}`}>
      {status}
    </span>
  );
}

// One regressed/unverifiable check, showing its status transition (from → to).
function TransitionRow({ name, from, to, ring, bg }: { name: string; from: CheckStatus; to: CheckStatus; ring: string; bg: string }) {
  return (
    <div className={`rounded-xl border ${ring} ${bg} p-3 flex items-center gap-3`}>
      <span className="text-sm font-semibold text-ds-ink min-w-0 flex-1 truncate">{name}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <StatusTag status={from} />
        <ArrowRight size={12} className="text-ds-secondary" />
        <StatusTag status={to} />
      </span>
    </div>
  );
}

// Renders EXACTLY the GovernanceDrift shape — verdict + per-check transitions +
// decision change. Regressions lead (act on these); the →skipped checks are
// de-emphasized as "couldn't verify, not a break" — never shown as failures.
function DriftSection({ drift, nameById }: { drift: GovernanceDrift; nameById: (id: string) => string }) {
  const v = VERDICT[drift.verdict];
  const VIcon = v.Icon;

  const regressed = drift.transitions.filter((t) => t.kind === 'regressed' || t.kind === 'degraded');
  const unverifiable = drift.transitions.filter((t) => t.kind === 'inconclusive');

  let sub: string;
  if (drift.verdict === 'regression') {
    const n = drift.regressions.length;
    const bits: string[] = [];
    if (n > 0) bits.push(`${n} check${n === 1 ? '' : 's'} regressed since the last run`);
    if (drift.decisionChange) bits.push(`launch decision dropped to ${drift.decisionChange.to.replace(/_/g, ' ')}`);
    sub = bits.join(' · ') || 'A confirmed regression since the last run.';
  } else if (drift.verdict === 'inconclusive') {
    const n = drift.inconclusive.length;
    sub = `${n} check${n === 1 ? '' : 's'} couldn't be verified this run — treated as inconclusive, not a break.`;
  } else {
    sub = 'No material check changes since the last run.';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
      className={`rounded-2xl border ${v.ring} ${v.bg} p-5`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${v.iconBg} flex items-center justify-center shrink-0`}>
          <VIcon className={v.iconText} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <History size={13} className="text-ds-secondary" />
            <span className="text-[11px] uppercase tracking-widest text-ds-secondary font-semibold">Drift since last run</span>
          </div>
          <h2 className={`text-lg font-bold ${v.text} mt-0.5`}>{v.label}</h2>
          <p className="text-ds-secondary text-sm mt-0.5">{sub}</p>
        </div>
      </div>

      {/* Decision change, when the top-level verdict moved between runs. */}
      {drift.decisionChange && (
        <div className="mt-4 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-ds-secondary">Launch decision</span>
          <span className={`font-semibold ${DECISION[drift.decisionChange.from].text}`}>{DECISION[drift.decisionChange.from].label}</span>
          <ArrowRight size={13} className="text-ds-secondary" />
          <span className={`font-semibold ${DECISION[drift.decisionChange.to].text}`}>{DECISION[drift.decisionChange.to].label}</span>
        </div>
      )}

      {/* Regressions first — what the user must act on. */}
      {regressed.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-rose-300/80 mb-2">Regressed · act on these</p>
          <div className="space-y-2">
            {regressed.map((t) => (
              <TransitionRow key={t.id} name={nameById(t.id)} from={t.from} to={t.to} ring="border-rose-500/30" bg="bg-rose-500/[0.06]" />
            ))}
          </div>
        </div>
      )}

      {/* Inconclusive — de-emphasized; couldn't verify, NOT a failure. */}
      {unverifiable.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-ds-secondary mb-2">Couldn&apos;t verify this run · not a break</p>
          <div className="space-y-2">
            {unverifiable.map((t) => (
              <TransitionRow key={t.id} name={nameById(t.id)} from={t.from} to={t.to} ring="border-ds-line" bg="bg-ds-card" />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function LaunchReadinessScreen({ report, onReset, drift, baselineNote }: { report: LaunchReadinessReport; onReset?: () => void; drift?: GovernanceDrift; baselineNote?: boolean }) {
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

  // Friendly name for a drift check id, drawn from this report's own checks.
  const nameById = (id: string) => report.checks.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="h-full w-full flex flex-col bg-ds-page overflow-hidden">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-ds-line bg-ds-card z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onReset && (
            <button onClick={onReset} className="p-2 rounded-lg hover:bg-ds-card text-ds-secondary hover:text-ds-secondary transition shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ds-ink truncate">Launch Readiness</div>
            <div className="text-xs text-ds-secondary truncate">{report.meta.url}</div>
          </div>
        </div>
      </header>

      <div className="flex-1 scroll-area bg-ds-page">
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
                <p className="text-ds-secondary text-sm mt-0.5">{d.sub}</p>
                <div className="flex items-center gap-2 mt-3">
                  <ShieldCheck size={14} className={report.approval.required ? 'text-amber-400' : 'text-emerald-400'} />
                  <span className="text-xs text-ds-secondary">
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

          {/* 1b — Drift since the last governance run (only when a comparison ran).
              A first governance run has no prior baseline → a quiet note, not an
              empty shell; never fabricate drift. */}
          {drift ? (
            <DriftSection drift={drift} nameById={nameById} />
          ) : baselineNote ? (
            <div className="rounded-2xl border border-ds-line bg-ds-card p-4 flex items-start gap-3">
              <History size={16} className="text-ds-secondary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ds-secondary">First governance run — baseline saved</p>
                <p className="text-xs text-ds-secondary mt-0.5">No prior run to compare against yet. Re-run this check later to see drift since now.</p>
              </div>
            </div>
          ) : null}

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

          {/* 3 — Consent & compliance verdict (always present; inconclusive until a live capture runs) */}
          {report.consentCompliance && <ConsentCompliancePanel consent={report.consentCompliance} />}

          {/* 4 — Evidence, only when a live capture ran */}
          {report.observed && <ObservedEvidence observed={report.observed} />}
        </div>
      </div>
    </div>
  );
}
