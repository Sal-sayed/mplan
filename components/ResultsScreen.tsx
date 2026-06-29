'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Target, BarChart3, MousePointerClick, Database,
  ShieldCheck, Settings2, Copy, Check, ChevronDown, FileSpreadsheet, Loader2, Star,
  CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, RefreshCw, History, Wrench,
} from 'lucide-react';
import KPICard from './KPICard';
import LaunchReadinessScreen from './LaunchReadinessScreen';
import MetricHealthScreen from './MetricHealthScreen';
import ImplementationGuideScreen from './ImplementationGuideScreen';
import GitHubInject from './GitHubInject';
import { AppShell } from '@/components/ds';
import { deriveJourney, journeyNavAction, type JourneyView } from '@/lib/measurement/journey-stage';
import type { Stage } from '@/components/ds/tokens';
import { buildConsentCoverage } from '@/lib/measurement/consent-coverage';
import type { ImplementationProposal } from '@/lib/measurement/implementation-proposal';
import type { MetricHealthEntry } from '@/lib/measurement/data-validation';
import type { MeasurementPlan, TrackedEvent } from '@/lib/measurement/types';
import type { LaunchReadinessReport } from '@/lib/measurement/launch-readiness';
import type { GovernanceDrift } from '@/lib/measurement/governance-diff';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Parse a JSON API response defensively. The long-running checks (launch
// readiness / drift / backfill) open a headless browser server-side; if that
// request times out or the server runs out of memory, the proxy can close the
// connection with an EMPTY or non-JSON body — a bare res.json() then throws the
// cryptic "Unexpected end of JSON input". Turn that into a clear, actionable
// message instead of leaking the raw parser error.
async function readJsonResponse(res: Response): Promise<any> {
  const text = await res.text().catch(() => '');
  if (!text.trim()) {
    if ([502, 503, 504].includes(res.status) || res.status === 0) {
      throw new Error(
        'The live check didn’t finish — opening the site timed out or the server ran low on memory. Try again, or leave the URL blank to run the instant plan-consistency check only.'
      );
    }
    throw new Error(`The server returned an empty response (HTTP ${res.status}). Please try again in a moment.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected server response (HTTP ${res.status}). Please try again in a moment.`);
  }
}

// Plan-level, per-event consent coverage — reads the plan only (no live site), so
// it always renders. Shows whether the plan accounts for every event's consent
// requirement; needs_attention rows sort first. Distinct from the live slice 1/2
// checks in the Launch Readiness screen.
function ConsentCoverageSection({ plan }: { plan: MeasurementPlan }) {
  const coverage = buildConsentCoverage(plan);
  if (coverage.rows.length === 0) return null;
  const { summary } = coverage;
  return (
    <div className="bg-ds-panel rounded-xl border border-ds-line p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h4 className="text-sm font-semibold text-ds-ink">Per-event consent coverage</h4>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-ds-muted">{summary.requiresConsentCount}/{summary.totalEvents} require consent</span>
          {summary.needsAttentionCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">{summary.needsAttentionCount} need attention</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">all covered</span>
          )}
        </div>
      </div>
      <p className="text-xs text-ds-muted mb-3">Every planned event and whether the plan&apos;s consent categories account for it — no live site needed.</p>
      <div className="rounded-lg overflow-hidden border border-ds-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-ds-panel text-ds-muted">
              <th className="text-left px-3 py-2 font-medium">Event</th>
              <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Category</th>
              <th className="text-center px-3 py-2 font-medium">Requires consent</th>
              <th className="text-center px-3 py-2 font-medium">Covered</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {coverage.rows.map((r) => (
              <tr key={r.eventId} className="border-t border-ds-line align-top">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <code className="text-blue-300 font-mono break-all">{r.eventName}</code>
                    {r.isKeyEvent && <Star className="w-3 h-3 text-amber-300 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-ds-muted mt-0.5">{r.note}</p>
                </td>
                <td className="px-3 py-2 text-ds-secondary hidden sm:table-cell capitalize">{r.category}</td>
                <td className="px-3 py-2 text-center text-ds-secondary">{r.requiresConsent ? 'yes' : 'no'}</td>
                <td className="px-3 py-2 text-center text-ds-secondary">{r.requiresConsent ? (r.consentCategoryCovered ? 'yes' : 'no') : '—'}</td>
                <td className="px-3 py-2">
                  {r.status === 'needs_attention' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium whitespace-nowrap"><AlertTriangle className="w-3 h-3" /> needs attention</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium whitespace-nowrap"><CheckCircle2 className="w-3 h-3" /> ok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'kpis', label: 'KPIs', icon: BarChart3 },
  { key: 'events', label: 'Events', icon: MousePointerClick },
  { key: 'datalayer', label: 'Data Layer', icon: Database },
  { key: 'consent', label: 'Consent', icon: ShieldCheck },
  { key: 'tooling', label: 'Tooling', icon: Settings2 },
];

// Inline plan-consistency verdict (the 7 credential-free `plan` checks only).
// Deliberately NOT the report's overall decision — that's always dragged to
// "go_with_warnings" by the 9 skipped live checks, which says nothing about
// whether the plan itself is sound. Live verification is its own step.
type Verdict = 'clean' | 'review' | 'issues';
const VERDICT: Record<Verdict, { label: string; sub: string; Icon: typeof CheckCircle2; text: string; ring: string; bg: string; iconBg: string; iconText: string }> = {
  clean:  { label: 'Plan is consistent', sub: 'All plan-consistency checks pass. Run the full check to verify live tracking.', Icon: CheckCircle2, text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-300' },
  review: { label: 'Review recommended', sub: 'Launchable, but some plan items are worth reviewing first.', Icon: AlertTriangle, text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', iconBg: 'bg-amber-500/15', iconText: 'text-amber-300' },
  issues: { label: 'Issues found', sub: 'The plan has blocking consistency problems to fix before launch.', Icon: AlertCircle, text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]', iconBg: 'bg-rose-500/20', iconText: 'text-rose-300' },
};

interface ResultsScreenProps { plan: MeasurementPlan; score: any; scrapeData: any; onReset: () => void; onRegenerate?: () => void; }

function ExcelDownloadBtn({ plan, score, scrapeData }: { plan: any; score: any; scrapeData: any }) {
  const [dl, setDl] = useState(false);
  const download = async () => {
    setDl(true);
    try {
      const res = await fetch('/api/download-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'excel', plan, score, scrapeData }) });
      if (!res.ok) throw new Error();
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'measurement-plan.xlsx'; a.click(); URL.revokeObjectURL(url);
    } catch { /* silent */ } finally { setDl(false); }
  };
  return (
    <button onClick={download} disabled={dl} className="px-4 py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm font-medium flex items-center gap-2 hover:bg-ds-panel transition disabled:opacity-50">
      {dl ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Download Excel
    </button>
  );
}

export default function ResultsScreen({ plan, score, scrapeData, onReset, onRegenerate }: ResultsScreenProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Launch-readiness gate (additive): idle → form → loading → done | error.
  const [rdPhase, setRdPhase] = useState<'idle' | 'form' | 'loading' | 'done' | 'error'>('idle');
  const [rdReport, setRdReport] = useState<LaunchReadinessReport | null>(null);
  // Drift is surfaced only when the response carries it (a governance run-to-run
  // comparison); the launch-readiness check returns none, so this stays null there.
  const [rdDrift, setRdDrift] = useState<GovernanceDrift | null>(null);
  // Which action produced the current run (drives loading copy + the first-run
  // baseline note); a governance run with no drift = baseline saved, nothing to
  // compare yet.
  const [rdKind, setRdKind] = useState<'readiness' | 'governance' | 'metrics'>('readiness');
  const [rdBaseline, setRdBaseline] = useState(false);
  // Metric-health results (threshold Data Validation), shown on its own screen.
  const [mhResults, setMhResults] = useState<MetricHealthEntry[]>([]);
  const [mhChecked, setMhChecked] = useState(false);
  // One-time historical backfill range (separate from the daily collector).
  const [bfStart, setBfStart] = useState('');
  const [bfEnd, setBfEnd] = useState('');
  // Phase A implementation guide (display-only proposal derived from the plan).
  const [igPhase, setIgPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [igProposal, setIgProposal] = useState<ImplementationProposal | null>(null);
  const [igError, setIgError] = useState('');
  // Stage 5: saved-plan history (optional sign-in).
  const [signedIn, setSignedIn] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [rdUrl, setRdUrl] = useState('');
  const [rdError, setRdError] = useState('');
  // Google connection (GA4/GTM checks) — admin-only, single-operator.
  const [rdGa4, setRdGa4] = useState('');
  const [rdGtm, setRdGtm] = useState('');
  const [gStatus, setGStatus] = useState<{ configured: boolean; connected: boolean; isAdmin: boolean; scopes?: string[]; expiresAt?: string } | null>(null);
  const [gLoading, setGLoading] = useState(false);

  // Ephemeral "stage reached" latches that drive the journey nav's done/upcoming
  // marks. NO persistence, NO schema — they reset on reload (a later slice persists
  // real stage history). Each is set true when its EXISTING handler succeeds; they
  // never touch any API or data flow.
  const [reachedSetup, setReachedSetup] = useState(false);
  const [reachedGoLive, setReachedGoLive] = useState(false);
  const [reachedMonitor, setReachedMonitor] = useState(false);

  // Inline plan-consistency badge: run the credential-free gate once on mount so
  // the verdict shows on the plan screen itself (no URL, no browser, fast).
  const [consistency, setConsistency] = useState<LaunchReadinessReport | null>(null);
  const [consistencyState, setConsistencyState] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConsistencyState('loading');
      try {
        const res = await fetch('/api/launch-readiness', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
        });
        const json = await readJsonResponse(res);
        if (cancelled) return;
        if (!res.ok || !json.success) { setConsistencyState('error'); return; }
        setConsistency(json.report as LaunchReadinessReport);
        setConsistencyState('done');
      } catch {
        if (!cancelled) setConsistencyState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [plan]);

  // Google connection helpers for the readiness modal's Full layer.
  const fetchGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/google/status');
      if (res.ok) setGStatus(await res.json());
    } catch { /* ignore — section just stays hidden */ }
  }, []);

  // Fetch status when the modal opens (an event handler, not an effect).
  const openReadiness = () => { setRdUrl(''); setRdError(''); setRdBaseline(false); setMhResults([]); setMhChecked(false); setBfStart(''); setBfEnd(''); setRdPhase('form'); fetchGoogleStatus(); };

  // Know whether the visitor is signed in, to show Save-to-history (optional sign-in).
  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setSignedIn(Boolean(d.user))).catch(() => {});
  }, []);
  const saveToHistory = async () => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      setSaveState(res.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  };

  // The OAuth popup posts back here when it finishes, so we refresh status
  // without navigating the main window away from the plan.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.source !== 'google-oauth') return;
      if (e.data.status === 'connected') fetchGoogleStatus();
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [fetchGoogleStatus]);

  const connectGoogle = () => window.open('/api/google/oauth/start', 'google_oauth', 'width=520,height=680');
  const disconnectGoogle = async () => {
    setGLoading(true);
    try { await fetch('/api/google/disconnect', { method: 'POST' }); await fetchGoogleStatus(); }
    finally { setGLoading(false); }
  };

  // Shared connector body for both checks — reuses the modal's GA4/GTM inputs so
  // there's no double entry (sent only when the operator is Google-connected).
  const connectorBody = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    if (gStatus?.connected) {
      if (rdGa4.trim()) b.ga4 = { propertyId: rdGa4.trim() };
      if (rdGtm.trim()) b.gtm = { containerId: rdGtm.trim() };
    }
    return b;
  };

  const runReadiness = async () => {
    setRdKind('readiness'); setRdBaseline(false); setRdPhase('loading'); setRdError('');
    try {
      const body: Record<string, unknown> = { plan, ...connectorBody() };
      const u = rdUrl.trim();
      if (u) body.deployedSiteUrl = u;
      const res = await fetch('/api/launch-readiness', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await readJsonResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error || 'Launch readiness check failed');
      setRdReport(json.report as LaunchReadinessReport);
      setRdDrift((json.drift as GovernanceDrift | undefined) ?? null);
      setRdPhase('done'); setReachedGoLive(true);
    } catch (e) {
      setRdError(e instanceof Error ? e.message : 'Launch readiness check failed');
      setRdPhase('error');
    }
  };

  // Governance drift check: re-runs the gate's config checks AND diffs against the
  // last saved run for this plan (persist + compareToLast). Same plan/connectors,
  // same error/loading handling as runReadiness — just the endpoint that returns
  // drift. The result threads into the SAME LaunchReadinessScreen, lighting up its
  // DriftSection.
  const runGovernance = async () => {
    setRdKind('governance'); setRdBaseline(false); setRdPhase('loading'); setRdError('');
    try {
      const body: Record<string, unknown> = { plan, persist: true, compareToLast: true, ...connectorBody() };
      const res = await fetch('/api/governance/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await readJsonResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error || 'Governance check failed');
      setRdReport(json.report as LaunchReadinessReport);
      const drift = (json.drift as GovernanceDrift | undefined) ?? null;
      setRdDrift(drift);
      // No drift on a governance run = no prior baseline yet (first run for this
      // plan). Surface a quiet note instead of an empty drift area.
      setRdBaseline(!drift);
      setRdPhase('done'); setReachedGoLive(true);
    } catch (e) {
      setRdError(e instanceof Error ? e.message : 'Governance check failed');
      setRdPhase('error');
    }
  };

  // Metric health: runs the threshold Data Validation agent over the plan's key
  // events for the entered GA4 property (operator-gated server-side). Reads the
  // already-collected metric history — no Google call. Renders MetricHealthScreen.
  // Shared: read the now-stored history and surface verdicts. Used by both the
  // plain metric-health check and the backfill (which populates history first).
  const loadMetricHealth = async () => {
    const res = await fetch('/api/metrics/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, ...connectorBody() }),
    });
    const json = await readJsonResponse(res);
    if (!res.ok || !json.success) throw new Error(json.error || 'Metric validation failed');
    setMhResults((json.results as MetricHealthEntry[] | undefined) ?? []);
    setMhChecked(json.propertyChecked === true);
  };

  const runMetricHealth = async () => {
    setRdKind('metrics'); setRdPhase('loading'); setRdError('');
    try {
      await loadMetricHealth();
      setRdPhase('done'); setReachedMonitor(true);
    } catch (e) {
      setRdError(e instanceof Error ? e.message : 'Metric validation failed');
      setRdPhase('error');
    }
  };

  // Phase A: derive the implementation proposal from the plan (display only —
  // no Google/GTM call, no write). Shows ImplementationGuideScreen.
  const runImplementationGuide = async () => {
    setIgPhase('loading'); setIgError('');
    try {
      const res = await fetch('/api/implementation/proposal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
      });
      const json = await readJsonResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not build the implementation guide.');
      setIgProposal(json.proposal as ImplementationProposal);
      setIgPhase('done'); setReachedSetup(true);
    } catch (e) {
      setIgError(e instanceof Error ? e.message : 'Could not build the implementation guide.');
      setIgPhase('error');
    }
  };

  // One-time backfill: pull a chosen GA4 date range into history (operator-gated
  // server-side), then immediately show the now-real verdicts. Separate endpoint
  // from the daily cron; reuses the same reader + store.
  const runBackfill = async () => {
    if (!bfStart || !bfEnd) { setRdError('Pick a start and end date to backfill.'); setRdPhase('error'); return; }
    setRdKind('metrics'); setRdPhase('loading'); setRdError('');
    try {
      const res = await fetch('/api/metrics/backfill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, ...connectorBody(), startDate: bfStart, endDate: bfEnd }),
      });
      const json = await readJsonResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error || 'Backfill failed');
      await loadMetricHealth(); // history is now populated → real verdicts
      setRdPhase('done'); setReachedMonitor(true);
    } catch (e) {
      setRdError(e instanceof Error ? e.message : 'Backfill failed');
      setRdPhase('error');
    }
  };

  const copySection = useCallback((key: string, data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedSection(key); setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  const toggleEvent = useCallback((i: number) => {
    setExpandedEvents(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }, []);

  const events = plan.events || [];
  const kpis = plan.kpis || [];
  const dataLayer = plan.dataLayer || [];
  const meta = plan.meta || ({} as MeasurementPlan['meta']);
  const keyEventCount = events.filter((e) => e.isKeyEvent).length;

  // Plan-consistency verdict derived from the credential-free `plan` checks only.
  const planChecks = consistency?.checks.filter((c) => c.dependsOn === 'plan') ?? [];
  const planFails = planChecks.filter((c) => c.status === 'fail').length;
  const planWarns = planChecks.filter((c) => c.status === 'warn').length;
  const planPass = planChecks.filter((c) => c.status === 'pass').length;
  const liveCount = consistency?.checks.filter((c) => c.status === 'skipped').length ?? 0;
  const verdict: Verdict = planFails > 0 ? 'issues' : planWarns > 0 ? 'review' : 'clean';
  const v = VERDICT[verdict];
  const VIcon = v.Icon;

  const SH = ({ title, k, data, count }: { title: string; k: string; data: unknown; count?: number }) => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-bold text-ds-ink">{title}</h3>
        {count !== undefined && <span className="text-xs bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full font-medium">{count}</span>}
      </div>
      <button onClick={() => copySection(k, data)} className="flex items-center gap-1.5 text-xs text-ds-muted hover:text-ds-ink transition-colors px-3 py-1.5 rounded-lg hover:bg-ds-panel">
        {copiedSection === k ? <><Check className="w-3.5 h-3.5 text-emerald-300" /><span className="text-emerald-300">Copied!</span></> : <><Copy className="w-3.5 h-3.5" />Copy JSON</>}
      </button>
    </div>
  );

  const CATEGORY_COLOR: Record<string, string> = {
    page: 'bg-slate-500/15 text-slate-300',
    engagement: 'bg-blue-500/15 text-blue-300',
    ecommerce: 'bg-emerald-500/15 text-emerald-300',
    form: 'bg-amber-500/15 text-amber-300',
    conversion: 'bg-pink-500/15 text-pink-300',
    custom: 'bg-purple-500/15 text-purple-300',
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return (
        <div className="space-y-6">
          {/* Plan-consistency badge — answers "is this plan correct?" right here,
              without needing the separate Launch readiness screen. */}
          {consistencyState === 'loading' && (
            <div className="rounded-2xl border border-ds-line bg-ds-panel p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-300 animate-spin" />
              <p className="text-sm text-ds-secondary">Checking plan consistency…</p>
            </div>
          )}
          {consistencyState === 'done' && consistency && (
            <div className={`rounded-2xl border ${v.ring} ${v.bg} p-5`}>
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl ${v.iconBg} flex items-center justify-center shrink-0`}>
                  <VIcon className={v.iconText} size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-lg font-bold ${v.text}`}>{v.label}</h3>
                    <span className="text-[11px] text-ds-muted uppercase tracking-wide">plan consistency</span>
                  </div>
                  <p className="text-sm text-ds-muted mt-0.5">{v.sub}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {planFails > 0 && <span className="text-xs px-2.5 py-1 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/20"><b>{planFails}</b> must fix</span>}
                    {planWarns > 0 && <span className="text-xs px-2.5 py-1 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/20"><b>{planWarns}</b> to review</span>}
                    <span className="text-xs px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/20"><b>{planPass}</b> passing</span>
                    <span className="text-xs px-2.5 py-1 rounded-full border bg-ds-panel text-ds-muted border-ds-line"><b>{liveCount}</b> need live verification</span>
                  </div>
                </div>
                <button onClick={openReadiness}
                  className="shrink-0 self-start px-3.5 py-2 rounded-xl bg-ds-panel border border-ds-line-strong text-ds-ink text-sm font-medium flex items-center gap-1.5 hover:bg-ds-panel transition">
                  Full check <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="bg-ds-card rounded-2xl border border-ds-line p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h3 className="text-lg font-bold text-ds-ink mb-4">Plan Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['URL', meta.url],
                ['Business model', meta.businessModel],
                ['Vertical', meta.vertical],
                ['Confidence', meta.classificationConfidence !== undefined ? `${Math.round((meta.classificationConfidence || 0) * 100)}%` : 'N/A'],
                ['Schema', meta.schemaVersion],
                ['Generated', meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString() : 'N/A'],
              ].map(([l, v]) => (
                <div key={l as string}><p className="text-xs text-ds-muted uppercase tracking-wider">{l as string}</p><p className="text-ds-secondary mt-1 text-sm font-medium break-words">{(v as string) || 'N/A'}</p></div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { l: 'KPIs', v: kpis.length },
              { l: 'Events', v: events.length },
              { l: 'Key Events', v: keyEventCount },
              { l: 'Data Layer Vars', v: dataLayer.length },
            ].map(s => (
              <motion.div key={s.l} whileHover={{ y: -3 }} className="bg-ds-card rounded-xl border border-ds-line p-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-md">
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-ds-ink">{s.v}</p>
                <p className="text-xs text-ds-muted mt-1 font-medium">{s.l}</p></motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-ds-panel rounded-2xl border border-ds-line p-5">
              <h4 className="text-sm font-semibold text-ds-ink mb-4">Consent</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {(plan.consent?.categoriesUsed || []).map((c) => <span key={c} className="text-xs bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-full font-medium capitalize">{c}</span>)}
              </div>
              <p className="text-xs text-ds-muted">Consent Mode {plan.consent?.consentModeRequired ? 'required' : 'not required'}.</p>
            </div>
            <div className="bg-ds-panel rounded-2xl border border-ds-line p-5">
              <h4 className="text-sm font-semibold text-ds-ink mb-4">Tooling</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-500/10 rounded-lg p-3"><p className="text-xl font-bold text-emerald-300">{plan.tooling?.ga4?.keyEvents?.length || 0}</p><p className="text-[11px] text-ds-muted mt-0.5">GA4 key events</p></div>
                <div className="bg-amber-500/10 rounded-lg p-3"><p className="text-xl font-bold text-amber-300">{plan.tooling?.gtm?.suggestedTagCount || 0}</p><p className="text-[11px] text-ds-muted mt-0.5">Suggested GTM tags</p></div>
              </div>
            </div>
          </div>
        </div>);

      case 'kpis': return (
        <div><SH title="KPIs" k="kpis" data={kpis} count={kpis.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{kpis.map((kpi, i) => <KPICard key={kpi.id || i} kpi={kpi} index={i} />)}</div></div>);

      case 'events': return (
        <div><SH title="GA4 Events" k="events" data={events} count={events.length} />
          <div className="space-y-2.5">
            {events.map((event: TrackedEvent, i: number) => (
              <motion.div key={event.id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-ds-panel rounded-xl border border-ds-line overflow-hidden hover:border-blue-500/20 transition-all">
                <button onClick={() => toggleEvent(i)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-ds-panel transition-colors">
                  <span className="text-xs text-ds-muted font-mono w-6 shrink-0 text-right">{String(i + 1).padStart(2, '0')}</span>
                  {event.isKeyEvent && <Star className="w-3.5 h-3.5 text-amber-300 shrink-0" fill="currentColor" />}
                  <code className="text-sm text-blue-300 font-mono font-medium flex-1 truncate">{event.name}</code>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${CATEGORY_COLOR[event.category] || 'bg-ds-panel text-ds-secondary'}`}>{event.category}</span>
                  {event.requiresConsent && <span className="text-[10px] text-ds-muted hidden sm:inline">consent</span>}
                  <ChevronDown className={`w-3.5 h-3.5 text-ds-muted transition-transform duration-200 shrink-0 ${expandedEvents.has(i) ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>{expandedEvents.has(i) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-4 pt-2 border-t border-ds-line">
                      <p className="text-sm text-ds-secondary mb-3">{event.description}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                        <div><p className="text-[10px] text-ds-muted uppercase tracking-widest mb-1">Trigger</p><p className="text-sm text-ds-secondary">{event.trigger}</p></div>
                        <div><p className="text-[10px] text-ds-muted uppercase tracking-widest mb-1">Flags</p><p className="text-sm text-ds-secondary">{event.isKeyEvent ? 'Key event' : 'Standard'}{event.requiresConsent ? ' · requires consent' : ''}</p></div>
                      </div>
                      {event.parameters?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-ds-muted uppercase tracking-widest mb-2">Parameters</p>
                          <div className="rounded-lg overflow-hidden border border-ds-line">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-ds-panel"><th className="text-left px-3 py-2 text-ds-muted font-medium">Name</th><th className="text-left px-3 py-2 text-ds-muted font-medium">Type</th><th className="text-left px-3 py-2 text-ds-muted font-medium">Req</th><th className="text-left px-3 py-2 text-ds-muted font-medium">Source</th></tr></thead>
                              <tbody>{event.parameters.map((p, j) => (
                                <tr key={p.name || j} className="border-t border-ds-line"><td className="px-3 py-1.5 text-cyan-300 font-mono">{p.name}</td><td className="px-3 py-1.5 text-ds-muted">{p.type}</td><td className="px-3 py-1.5 text-ds-muted">{p.required ? 'yes' : 'no'}</td><td className="px-3 py-1.5 text-ds-muted font-mono">{p.source}</td></tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}</AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>);

      case 'datalayer': return (
        <div><SH title="Data Layer" k="datalayer" data={dataLayer} count={dataLayer.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{dataLayer.map((d, i) => (
            <motion.div key={d.key || i} whileHover={{ y: -2 }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-ds-panel rounded-xl border border-ds-line p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-center justify-between mb-2"><code className="text-ds-ink font-semibold text-sm font-mono">{d.key}</code><span className="text-xs bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-full font-medium">{d.type}</span></div>
              <p className="text-sm text-ds-muted mb-2">{d.description}</p>
              {d.example && <div className="text-xs text-ds-muted bg-ds-panel rounded-lg p-2 font-mono border border-ds-line mb-2 break-words">{d.example}</div>}
              {d.usedByEventIds?.length > 0 && <div className="flex flex-wrap gap-1">{d.usedByEventIds.map((id) => <span key={id} className="text-[10px] font-mono bg-ds-panel text-ds-muted px-1.5 py-0.5 rounded border border-ds-line">{id}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'consent': return (
        <div><SH title="Consent Plan" k="consent" data={plan.consent} />
          <div className="space-y-4">
            <div className="bg-ds-panel rounded-xl border border-ds-line p-5">
              <h4 className="text-sm font-semibold text-ds-ink mb-3">Categories used</h4>
              <div className="flex flex-wrap gap-2">{(plan.consent?.categoriesUsed || []).map((c) => <span key={c} className="text-xs bg-blue-500/15 text-blue-300 px-3 py-1.5 rounded-full font-medium capitalize">{c}</span>)}</div>
            </div>
            <div className="bg-ds-panel rounded-xl border border-ds-line p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${plan.consent?.consentModeRequired ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                  Consent Mode {plan.consent?.consentModeRequired ? 'required' : 'not required'}
                </span>
              </div>
              {plan.consent?.notes && <p className="text-sm text-ds-muted mt-2">{plan.consent.notes}</p>}
            </div>
            <ConsentCoverageSection plan={plan} />
          </div></div>);

      case 'tooling': return (
        <div><SH title="Tooling" k="tooling" data={plan.tooling} />
          <div className="space-y-4">
            <div className="bg-ds-panel rounded-xl border border-ds-line p-5">
              <h4 className="text-sm font-semibold text-ds-ink mb-3">GA4</h4>
              <p className="text-[10px] text-ds-muted uppercase tracking-widest mb-2">Key events</p>
              <div className="flex flex-wrap gap-2 mb-4">{(plan.tooling?.ga4?.keyEvents || []).map((e) => <code key={e} className="text-xs text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">{e}</code>)}</div>
              {(plan.tooling?.ga4?.customDimensions?.length || 0) > 0 && (
                <>
                  <p className="text-[10px] text-ds-muted uppercase tracking-widest mb-2">Custom dimensions</p>
                  <div className="rounded-lg overflow-hidden border border-ds-line">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-ds-panel"><th className="text-left px-3 py-2 text-ds-muted font-medium">Name</th><th className="text-left px-3 py-2 text-ds-muted font-medium">Scope</th><th className="text-left px-3 py-2 text-ds-muted font-medium">Parameter</th></tr></thead>
                      <tbody>{(plan.tooling?.ga4?.customDimensions || []).map((d, j) => (
                        <tr key={d.name || j} className="border-t border-ds-line"><td className="px-3 py-1.5 text-ds-secondary">{d.name}</td><td className="px-3 py-1.5 text-ds-muted">{d.scope}</td><td className="px-3 py-1.5 text-cyan-300 font-mono">{d.parameter}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="bg-ds-panel rounded-xl border border-ds-line p-5">
              <h4 className="text-sm font-semibold text-ds-ink mb-2">GTM</h4>
              <p className="text-sm text-ds-secondary mb-1">Suggested tags: <span className="font-semibold text-ds-ink">{plan.tooling?.gtm?.suggestedTagCount ?? 0}</span></p>
              {plan.tooling?.gtm?.notes && <p className="text-sm text-ds-muted">{plan.tooling.gtm.notes}</p>}
            </div>
          </div></div>);

      default: return null;
    }
  };

  // ── Journey wiring (presentational only) ──────────────────────────────────
  // The post-plan hub renders INSIDE AppShell so the 4-stage journey nav stays
  // visible. The Set up / Go live / Monitor screens used to be early-return
  // takeovers that replaced everything (hiding the nav); they now render as the
  // shell's content too, picked by the SAME state flags. Only the render LOCATION
  // changed — no screen's logic, props, or API calls were touched.
  const hub = (
    <div className="h-full w-full flex flex-col overflow-hidden bg-ds-page">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-ds-line bg-ds-card z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onReset} className="p-2 rounded-lg hover:bg-ds-panel text-ds-muted hover:text-ds-secondary transition shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0 hidden sm:block"><div className="text-sm font-semibold text-ds-ink truncate">Measurement Plan</div><div className="text-xs text-ds-muted truncate">{meta.url}</div></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {signedIn ? (
            <>
              <button onClick={saveToHistory} disabled={saveState === 'saving' || saveState === 'saved'}
                className="px-3 py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm font-medium flex items-center gap-2 hover:bg-ds-panel transition disabled:opacity-60">
                <History size={14} /> <span className="hidden sm:inline">{saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save to history'}</span>
              </button>
              <Link href="/history" className="text-xs text-ds-muted hover:text-ds-secondary hidden sm:inline px-1">History</Link>
            </>
          ) : (
            <Link href="/signin" className="text-sm text-ds-secondary hover:text-ds-ink px-1">Sign in</Link>
          )}
          <button onClick={openReadiness}
            className="px-4 py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm font-medium flex items-center gap-2 hover:bg-ds-panel transition">
            <ShieldCheck size={14} /> <span className="hidden sm:inline">Launch readiness</span>
          </button>
          <button onClick={runImplementationGuide}
            className="px-4 py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm font-medium flex items-center gap-2 hover:bg-ds-panel transition">
            <Wrench size={14} className="text-cyan-300" /> <span className="hidden sm:inline">Implementation guide</span>
          </button>
          <ExcelDownloadBtn plan={plan} score={score} scrapeData={scrapeData} />
        </div>
      </header>

      {plan.meta?.source === 'template' && (
        <div className="shrink-0 px-4 lg:px-6 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20 flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-300 shrink-0" />
          <p className="text-xs text-amber-300/90 flex-1 min-w-0">
            <span className="font-semibold">Template starting point.</span> AI tailoring was unavailable, so this is a standards-based GA4/GTM baseline — solid to build from, but not customized to your site.
          </p>
          {onRegenerate && (
            <button onClick={onRegenerate}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition flex items-center gap-1.5">
              <RefreshCw size={12} /> Regenerate with AI
            </button>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:block shrink-0 w-52 border-r border-ds-line bg-ds-page">
          <nav className="h-full scroll-area py-3 px-2">
            {TABS.map(tab => { const Icon = tab.icon; const active = activeTab === tab.key;
              return (<button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition mb-0.5 ${active ? 'bg-ds-accent-soft text-ds-accent border border-ds-accent/20 font-semibold' : 'text-ds-muted hover:bg-ds-panel hover:text-ds-secondary'}`}>
                <Icon size={16} className="shrink-0" /><span className="truncate">{tab.label}</span></button>);
            })}
          </nav>
        </aside>

        <div className="lg:hidden shrink-0 absolute top-16 left-0 right-0 z-10 h-12 overflow-x-auto no-scrollbar flex gap-1 px-4 border-b border-ds-line bg-ds-card items-center">
          {TABS.map(t => { const Icon = t.icon; return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition font-medium ${activeTab === t.key ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25' : 'text-ds-muted'}`}>
              <Icon size={12} />{t.label}</button>);
          })}
        </div>

        <div className="flex-1 scroll-area lg:mt-0 mt-12 bg-ds-page">
          <div className="p-4 lg:p-8 max-w-5xl">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {renderContent()}
            </motion.div>
          </div>
        </div>
      </div>

      {(rdPhase === 'form' || rdPhase === 'loading' || rdPhase === 'error') && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ds-page">
          <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center gap-3 border-b border-ds-line bg-ds-card">
            <button onClick={() => { setRdPhase('idle'); setRdError(''); }} aria-label="Back"
              className="p-2 rounded-lg hover:bg-ds-panel text-ds-muted hover:text-ds-secondary transition shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ds-ink truncate flex items-center gap-2">
                <ShieldCheck size={15} className="text-blue-300" /> Launch readiness check
              </div>
              <div className="text-xs text-ds-muted truncate">{meta.url}</div>
            </div>
          </header>

          {rdPhase === 'loading' ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-blue-300 animate-spin mx-auto mb-4" />
                <p className="text-ds-ink font-semibold text-lg">
                  {rdKind === 'governance' ? 'Checking for drift…' : rdKind === 'metrics' ? 'Checking metric health…' : 'Running launch readiness…'}
                </p>
                <p className="text-ds-muted text-sm mt-1.5 max-w-sm mx-auto">
                  {rdKind === 'governance'
                    ? 'Re-checking your plan setup and comparing it to your last saved run.'
                    : rdKind === 'metrics'
                      ? 'Judging each key event’s recent firing against its trailing baseline.'
                      : rdUrl.trim() ? 'Capturing the live site — this can take up to a minute.' : 'Checking plan consistency…'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              {/* ── Setup — the only scrolling region (scrolls independently when tall) ── */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-4">
                  <p className="text-ds-muted text-sm max-w-2xl">
                    Two layers of verification. The quick one already ran from your plan; the full one opens your deployed site to see what actually fires.
                  </p>

                  {/* Layer 1 — plan consistency (already done, no URL) */}
                  <div className="rounded-2xl border border-ds-line bg-ds-panel p-5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">Quick</span>
                      <span className="text-sm text-ds-ink font-medium">Plan consistency</span>
                      <span className="ml-auto text-[11px] text-ds-muted">instant · no URL</span>
                    </div>
                    <p className="text-xs text-ds-muted mt-2">
                      Already analyzed from <code className="text-ds-secondary break-all">{meta.url}</code> — no need to re-enter it. Running a check refreshes this.
                    </p>
                  </div>

                  {/* Layer 2 — live verification (optional URL) */}
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">Full</span>
                      <span className="text-sm text-ds-ink font-medium">Live verification</span>
                      <span className="ml-auto text-[11px] text-ds-muted">~1 min</span>
                    </div>
                    <label className="block text-xs text-ds-muted mb-1">
                      Staging / live URL <span className="text-ds-muted">(optional)</span>
                    </label>
                    <input value={rdUrl} onChange={(e) => setRdUrl(e.target.value)} placeholder="https://staging.example.com"
                      className="w-full bg-ds-panel border border-ds-line rounded-xl px-3 py-2.5 text-sm text-ds-ink placeholder:text-ds-muted focus:outline-none focus:border-blue-500/40 mb-2" />
                    <p className="text-[11px] text-ds-muted">
                      Point at a URL where GA4/GTM is deployed to capture what fires. Leave blank to re-run plan consistency only.
                    </p>

                    {/* Google connection — turns the 5 GA4/GTM "not verified" checks into real pass/fail. */}
                    <div className="mt-4 pt-4 border-t border-ds-line">
                      {!gStatus ? (
                        <p className="text-[11px] text-ds-muted">Checking Google connection…</p>
                      ) : !gStatus.configured ? (
                        <p className="text-[11px] text-ds-muted">GA4/GTM account checks aren&apos;t configured on the server.</p>
                      ) : !gStatus.isAdmin ? (
                        <p className="text-[11px] text-ds-muted">
                          Verifying GA4 &amp; GTM accounts needs the operator signed in.{' '}
                          <a href="/leads" target="_blank" rel="noreferrer" className="text-blue-300 underline">Sign in as admin</a>, then reopen this.
                        </p>
                      ) : !gStatus.connected ? (
                        <div>
                          <p className="text-[11px] text-ds-muted mb-2">Connect Google (read-only) to verify your GA4 property &amp; GTM container.</p>
                          <button type="button" onClick={connectGoogle}
                            className="px-3 py-1.5 rounded-lg bg-ds-panel border border-ds-line-strong text-ds-ink text-xs font-medium hover:bg-ds-panel transition flex items-center gap-1.5">
                            <ShieldCheck size={12} /> Connect Google
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-emerald-300 flex items-center gap-1"><Check size={12} /> Google connected</span>
                            <button type="button" onClick={disconnectGoogle} disabled={gLoading}
                              className="ml-auto text-[11px] text-ds-muted hover:text-ds-secondary underline disabled:opacity-50">Disconnect</button>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <input value={rdGa4} onChange={(e) => setRdGa4(e.target.value)} placeholder="GA4 property ID"
                              className="w-full bg-ds-panel border border-ds-line rounded-lg px-2.5 py-2 text-xs text-ds-ink placeholder:text-ds-muted focus:outline-none focus:border-blue-500/40" />
                            <input value={rdGtm} onChange={(e) => setRdGtm(e.target.value)} placeholder="GTM-XXXXXXX"
                              className="w-full bg-ds-panel border border-ds-line rounded-lg px-2.5 py-2 text-xs text-ds-ink placeholder:text-ds-muted focus:outline-none focus:border-blue-500/40" />
                          </div>
                          <p className="text-[10px] text-ds-muted">Optional — fill either to verify it; leave empty to skip the Google checks.</p>

                          {/* One-time historical backfill — pulls a chosen GA4 date
                              range into metric history so the health check has a
                              baseline. Separate from the daily collector. */}
                          <div className="mt-1 pt-3 border-t border-ds-line">
                            <p className="text-[11px] text-ds-muted mb-1.5">Backfill historical metrics for the GA4 property above (one-time):</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <label className="block">
                                <span className="text-[10px] text-ds-muted">Start date</span>
                                <input type="date" value={bfStart} onChange={(e) => setBfStart(e.target.value)}
                                  className="w-full mt-0.5 bg-ds-panel border border-ds-line rounded-lg px-2.5 py-2 text-xs text-ds-ink focus:outline-none focus:border-cyan-500/40" />
                              </label>
                              <label className="block">
                                <span className="text-[10px] text-ds-muted">End date</span>
                                <input type="date" value={bfEnd} onChange={(e) => setBfEnd(e.target.value)}
                                  className="w-full mt-0.5 bg-ds-panel border border-ds-line rounded-lg px-2.5 py-2 text-xs text-ds-ink focus:outline-none focus:border-cyan-500/40" />
                              </label>
                            </div>
                            <button type="button" onClick={runBackfill}
                              className="mt-2 w-full py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/20 transition flex items-center justify-center gap-1.5">
                              <BarChart3 size={12} /> Backfill &amp; check this range
                            </button>
                            <p className="text-[10px] text-ds-muted mt-1">Pulls daily GA4 event counts for the range into history, then runs the metric health check. Keep ranges within ~a year.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* One-stop: create GTM/GA4/Meta, then open a PR adding GTM to the site. */}
                    <GitHubInject plan={plan} defaultContainerId={rdGtm} />
                  </div>
                </div>
              </div>

              {/* ── Actions — OUTSIDE the scroll, so they're ALWAYS visible: a right
                  rail on wide screens, a fixed bottom bar on narrow ones. ── */}
              <div className="shrink-0 lg:w-80 border-t lg:border-t-0 lg:border-l border-ds-line bg-ds-card p-4 lg:p-5 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-2.5">
                  <h3 className="text-sm font-semibold text-ds-ink mb-1 hidden lg:block">Run a check</h3>
                  {rdPhase === 'error' && <p className="text-sm text-rose-300">{rdError}</p>}
                  <button onClick={runReadiness}
                    className="w-full py-2.5 rounded-xl bg-ds-accent text-ds-accent-ink font-semibold text-sm hover:bg-ds-accent-hover shadow-sm transition">
                    Run check
                  </button>
                  {/* Additive governance action — config-only, no URL. Compares this
                      plan's setup to the last saved run and lights up the DriftSection. */}
                  <button onClick={runGovernance}
                    className="w-full py-2.5 rounded-xl bg-ds-panel border border-ds-line-strong text-ds-secondary text-sm font-medium hover:bg-ds-panel transition flex items-center justify-center gap-2">
                    <History size={14} className="text-ds-muted" /> Check for drift since last run
                  </button>
                  {/* Additive metric-health action — judges each key event's recent
                      firing against its trailing baseline (collected metric history). */}
                  <button onClick={runMetricHealth}
                    className="w-full py-2.5 rounded-xl bg-ds-panel border border-ds-line-strong text-ds-secondary text-sm font-medium hover:bg-ds-panel transition flex items-center justify-center gap-2">
                    <BarChart3 size={14} className="text-cyan-300" /> Check metric health
                  </button>
                  <button onClick={() => { setRdPhase('idle'); setRdError(''); }}
                    className="w-full py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm hover:bg-ds-panel transition">
                    Cancel
                  </button>
                  <p className="text-[11px] text-ds-muted pt-1">
                    Drift compares your setup to the last saved run; metric health checks your key events are still firing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Pick which screen fills the shell — the SAME flags that drove the old
  // early-return takeovers; now they choose the AppShell content instead.
  let content: ReactNode = hub;
  if (igPhase === 'done' && igProposal) {
    content = <ImplementationGuideScreen proposal={igProposal} plan={plan} url={meta.url} onReset={() => { setIgPhase('idle'); setIgProposal(null); }} />;
  } else if (igPhase === 'loading' || igPhase === 'error') {
    content = (
      <div className="h-full w-full flex flex-col items-center justify-center bg-ds-page p-6 text-center">
        {igPhase === 'loading' ? (
          <>
            <Loader2 className="w-10 h-10 text-cyan-300 animate-spin mb-4" />
            <p className="text-ds-ink font-semibold text-lg">Building implementation guide…</p>
            <p className="text-ds-muted text-sm mt-1.5">Deriving the GTM tags, triggers, and dataLayer pushes from your plan.</p>
          </>
        ) : (
          <>
            <p className="text-rose-300 font-semibold">{igError}</p>
            <button onClick={() => { setIgPhase('idle'); setIgError(''); }} className="mt-4 px-4 py-2 rounded-xl bg-ds-panel border border-ds-line text-ds-secondary text-sm hover:bg-ds-panel transition">Back</button>
          </>
        )}
      </div>
    );
  } else if (rdPhase === 'done' && rdKind === 'metrics') {
    content = <MetricHealthScreen results={mhResults} propertyChecked={mhChecked} onReset={() => { setRdPhase('idle'); setMhResults([]); setMhChecked(false); }} />;
  } else if (rdPhase === 'done' && rdReport) {
    content = <LaunchReadinessScreen report={rdReport} drift={rdDrift ?? undefined} baselineNote={rdBaseline} onReset={() => { setRdPhase('idle'); setRdReport(null); setRdDrift(null); setRdBaseline(false); }} />;
  }

  // Which stage is being viewed (same flags) → drives the nav highlight; the
  // reached-latches mark earlier stages done. Pure derivation, no persistence.
  const view: JourneyView =
    igPhase === 'done' || igPhase === 'loading' || igPhase === 'error'
      ? 'setup'
      : rdPhase === 'done' && rdKind === 'metrics'
        ? 'monitor'
        : rdPhase === 'done' && rdReport
          ? 'golive'
          : 'plan';
  const { currentStage, statuses } = deriveJourney({
    hasPlan: true,
    setupReached: reachedSetup,
    goLive: reachedGoLive || rdReport?.decision === 'go',
    monitorReached: reachedMonitor,
    view,
  });

  // Journey-nav clicks are a SECOND trigger surface for the EXISTING handlers
  // (the in-screen buttons still call the same ones). No handler is duplicated.
  const handleSelectStage = (stage: Stage) => {
    switch (journeyNavAction(stage)) {
      case 'setup': runImplementationGuide(); break;
      case 'golive': openReadiness(); break;
      case 'monitor': runMetricHealth(); break;
      default: // 'plan' — return to the Stage-1 tabs hub (mirrors each screen's Back)
        setIgPhase('idle'); setIgProposal(null);
        setRdPhase('idle'); setRdReport(null); setRdDrift(null); setRdBaseline(false);
        setMhResults([]); setMhChecked(false);
        break;
    }
  };

  return (
    <AppShell
      currentStage={currentStage}
      statuses={statuses}
      siteName={meta.url}
      onSelectStage={handleSelectStage}
      contentClassName="p-0"
    >
      {content}
    </AppShell>
  );
}
