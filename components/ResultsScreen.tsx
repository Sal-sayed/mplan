'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Target, BarChart3, MousePointerClick, Database,
  ShieldCheck, Settings2, Copy, Check, ChevronDown, FileSpreadsheet, Loader2, Star,
  CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, RefreshCw, History,
} from 'lucide-react';
import KPICard from './KPICard';
import LaunchReadinessScreen from './LaunchReadinessScreen';
import MetricHealthScreen from './MetricHealthScreen';
import type { MetricHealthEntry } from '@/lib/measurement/data-validation';
import type { MeasurementPlan, TrackedEvent } from '@/lib/measurement/types';
import type { LaunchReadinessReport } from '@/lib/measurement/launch-readiness';
import type { GovernanceDrift } from '@/lib/measurement/governance-diff';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  clean:  { label: 'Plan is consistent', sub: 'All plan-consistency checks pass. Run the full check to verify live tracking.', Icon: CheckCircle2, text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400' },
  review: { label: 'Review recommended', sub: 'Launchable, but some plan items are worth reviewing first.', Icon: AlertTriangle, text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', iconBg: 'bg-amber-500/15', iconText: 'text-amber-400' },
  issues: { label: 'Issues found', sub: 'The plan has blocking consistency problems to fix before launch.', Icon: AlertCircle, text: 'text-rose-300', ring: 'border-rose-500/40', bg: 'bg-rose-500/[0.10]', iconBg: 'bg-rose-500/20', iconText: 'text-rose-400' },
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
    <button onClick={download} disabled={dl} className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-200 text-sm font-medium flex items-center gap-2 hover:bg-white/[0.1] transition disabled:opacity-50">
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
  const [rdUrl, setRdUrl] = useState('');
  const [rdError, setRdError] = useState('');
  // Google connection (GA4/GTM checks) — admin-only, single-operator.
  const [rdGa4, setRdGa4] = useState('');
  const [rdGtm, setRdGtm] = useState('');
  const [gStatus, setGStatus] = useState<{ configured: boolean; connected: boolean; isAdmin: boolean; scopes?: string[]; expiresAt?: string } | null>(null);
  const [gLoading, setGLoading] = useState(false);

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
        const json = await res.json();
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
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Launch readiness check failed');
      setRdReport(json.report as LaunchReadinessReport);
      setRdDrift((json.drift as GovernanceDrift | undefined) ?? null);
      setRdPhase('done');
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
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Governance check failed');
      setRdReport(json.report as LaunchReadinessReport);
      const drift = (json.drift as GovernanceDrift | undefined) ?? null;
      setRdDrift(drift);
      // No drift on a governance run = no prior baseline yet (first run for this
      // plan). Surface a quiet note instead of an empty drift area.
      setRdBaseline(!drift);
      setRdPhase('done');
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
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Metric validation failed');
    setMhResults((json.results as MetricHealthEntry[] | undefined) ?? []);
    setMhChecked(json.propertyChecked === true);
  };

  const runMetricHealth = async () => {
    setRdKind('metrics'); setRdPhase('loading'); setRdError('');
    try {
      await loadMetricHealth();
      setRdPhase('done');
    } catch (e) {
      setRdError(e instanceof Error ? e.message : 'Metric validation failed');
      setRdPhase('error');
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
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Backfill failed');
      await loadMetricHealth(); // history is now populated → real verdicts
      setRdPhase('done');
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
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {count !== undefined && <span className="text-xs bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full font-medium">{count}</span>}
      </div>
      <button onClick={() => copySection(k, data)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.05]">
        {copiedSection === k ? <><Check className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500">Copied!</span></> : <><Copy className="w-3.5 h-3.5" />Copy JSON</>}
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
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <p className="text-sm text-slate-300">Checking plan consistency…</p>
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
                    <span className="text-[11px] text-slate-500 uppercase tracking-wide">plan consistency</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{v.sub}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {planFails > 0 && <span className="text-xs px-2.5 py-1 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/20"><b>{planFails}</b> must fix</span>}
                    {planWarns > 0 && <span className="text-xs px-2.5 py-1 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/20"><b>{planWarns}</b> to review</span>}
                    <span className="text-xs px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/20"><b>{planPass}</b> passing</span>
                    <span className="text-xs px-2.5 py-1 rounded-full border bg-white/[0.04] text-slate-400 border-white/[0.08]"><b>{liveCount}</b> need live verification</span>
                  </div>
                </div>
                <button onClick={openReadiness}
                  className="shrink-0 self-start px-3.5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-slate-100 text-sm font-medium flex items-center gap-1.5 hover:bg-white/[0.12] transition">
                  Full check <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 rounded-2xl border border-blue-500/25 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Plan Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['URL', meta.url],
                ['Business model', meta.businessModel],
                ['Vertical', meta.vertical],
                ['Confidence', meta.classificationConfidence !== undefined ? `${Math.round((meta.classificationConfidence || 0) * 100)}%` : 'N/A'],
                ['Schema', meta.schemaVersion],
                ['Generated', meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString() : 'N/A'],
              ].map(([l, v]) => (
                <div key={l as string}><p className="text-xs text-slate-400 uppercase tracking-wider">{l as string}</p><p className="text-slate-200 mt-1 text-sm font-medium break-words">{(v as string) || 'N/A'}</p></div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { l: 'KPIs', v: kpis.length, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10 border-blue-500/20' },
              { l: 'Events', v: events.length, color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-500/10 border-cyan-500/20' },
              { l: 'Key Events', v: keyEventCount, color: 'from-pink-500 to-pink-600', bg: 'bg-pink-500/10 border-pink-500/20' },
              { l: 'Data Layer Vars', v: dataLayer.length, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-500/10 border-purple-500/20' },
            ].map(s => (
              <motion.div key={s.l} whileHover={{ y: -3 }} className={`${s.bg} rounded-xl border p-5 text-center transition-all hover:shadow-lg`}>
                <p className={`text-3xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.v}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">{s.l}</p></motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/[0.05] rounded-2xl border border-white/[0.08] p-5">
              <h4 className="text-sm font-semibold text-white mb-4">Consent</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {(plan.consent?.categoriesUsed || []).map((c) => <span key={c} className="text-xs bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-full font-medium capitalize">{c}</span>)}
              </div>
              <p className="text-xs text-slate-400">Consent Mode {plan.consent?.consentModeRequired ? 'required' : 'not required'}.</p>
            </div>
            <div className="bg-white/[0.05] rounded-2xl border border-white/[0.08] p-5">
              <h4 className="text-sm font-semibold text-white mb-4">Tooling</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-500/10 rounded-lg p-3"><p className="text-xl font-bold text-emerald-400">{plan.tooling?.ga4?.keyEvents?.length || 0}</p><p className="text-[11px] text-slate-500 mt-0.5">GA4 key events</p></div>
                <div className="bg-amber-500/10 rounded-lg p-3"><p className="text-xl font-bold text-amber-400">{plan.tooling?.gtm?.suggestedTagCount || 0}</p><p className="text-[11px] text-slate-500 mt-0.5">Suggested GTM tags</p></div>
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
                className="bg-white/[0.04] rounded-xl border border-white/[0.07] overflow-hidden hover:border-blue-500/20 transition-all">
                <button onClick={() => toggleEvent(i)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
                  <span className="text-xs text-slate-600 font-mono w-6 shrink-0 text-right">{String(i + 1).padStart(2, '0')}</span>
                  {event.isKeyEvent && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" />}
                  <code className="text-sm text-blue-400 font-mono font-medium flex-1 truncate">{event.name}</code>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${CATEGORY_COLOR[event.category] || 'bg-white/[0.06] text-slate-300'}`}>{event.category}</span>
                  {event.requiresConsent && <span className="text-[10px] text-slate-500 hidden sm:inline">consent</span>}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 shrink-0 ${expandedEvents.has(i) ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>{expandedEvents.has(i) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-4 pt-2 border-t border-white/[0.05]">
                      <p className="text-sm text-slate-300 mb-3">{event.description}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Trigger</p><p className="text-sm text-slate-300">{event.trigger}</p></div>
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Flags</p><p className="text-sm text-slate-300">{event.isKeyEvent ? 'Key event' : 'Standard'}{event.requiresConsent ? ' · requires consent' : ''}</p></div>
                      </div>
                      {event.parameters?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Parameters</p>
                          <div className="rounded-lg overflow-hidden border border-white/[0.06]">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-white/[0.03]"><th className="text-left px-3 py-2 text-slate-500 font-medium">Name</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Type</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Req</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Source</th></tr></thead>
                              <tbody>{event.parameters.map((p, j) => (
                                <tr key={p.name || j} className="border-t border-white/[0.04]"><td className="px-3 py-1.5 text-cyan-400 font-mono">{p.name}</td><td className="px-3 py-1.5 text-slate-500">{p.type}</td><td className="px-3 py-1.5 text-slate-500">{p.required ? 'yes' : 'no'}</td><td className="px-3 py-1.5 text-slate-500 font-mono">{p.source}</td></tr>
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
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-center justify-between mb-2"><code className="text-white font-semibold text-sm font-mono">{d.key}</code><span className="text-xs bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-medium">{d.type}</span></div>
              <p className="text-sm text-slate-500 mb-2">{d.description}</p>
              {d.example && <div className="text-xs text-slate-400 bg-white/[0.03] rounded-lg p-2 font-mono border border-white/[0.05] mb-2 break-words">{d.example}</div>}
              {d.usedByEventIds?.length > 0 && <div className="flex flex-wrap gap-1">{d.usedByEventIds.map((id) => <span key={id} className="text-[10px] font-mono bg-white/[0.04] text-slate-400 px-1.5 py-0.5 rounded border border-white/[0.05]">{id}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'consent': return (
        <div><SH title="Consent Plan" k="consent" data={plan.consent} />
          <div className="space-y-4">
            <div className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">Categories used</h4>
              <div className="flex flex-wrap gap-2">{(plan.consent?.categoriesUsed || []).map((c) => <span key={c} className="text-xs bg-blue-500/15 text-blue-300 px-3 py-1.5 rounded-full font-medium capitalize">{c}</span>)}</div>
            </div>
            <div className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${plan.consent?.consentModeRequired ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                  Consent Mode {plan.consent?.consentModeRequired ? 'required' : 'not required'}
                </span>
              </div>
              {plan.consent?.notes && <p className="text-sm text-slate-400 mt-2">{plan.consent.notes}</p>}
            </div>
          </div></div>);

      case 'tooling': return (
        <div><SH title="Tooling" k="tooling" data={plan.tooling} />
          <div className="space-y-4">
            <div className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">GA4</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Key events</p>
              <div className="flex flex-wrap gap-2 mb-4">{(plan.tooling?.ga4?.keyEvents || []).map((e) => <code key={e} className="text-xs text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">{e}</code>)}</div>
              {(plan.tooling?.ga4?.customDimensions?.length || 0) > 0 && (
                <>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Custom dimensions</p>
                  <div className="rounded-lg overflow-hidden border border-white/[0.06]">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-white/[0.03]"><th className="text-left px-3 py-2 text-slate-500 font-medium">Name</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Scope</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Parameter</th></tr></thead>
                      <tbody>{(plan.tooling?.ga4?.customDimensions || []).map((d, j) => (
                        <tr key={d.name || j} className="border-t border-white/[0.04]"><td className="px-3 py-1.5 text-slate-200">{d.name}</td><td className="px-3 py-1.5 text-slate-500">{d.scope}</td><td className="px-3 py-1.5 text-cyan-400 font-mono">{d.parameter}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5">
              <h4 className="text-sm font-semibold text-white mb-2">GTM</h4>
              <p className="text-sm text-slate-300 mb-1">Suggested tags: <span className="font-semibold text-white">{plan.tooling?.gtm?.suggestedTagCount ?? 0}</span></p>
              {plan.tooling?.gtm?.notes && <p className="text-sm text-slate-400">{plan.tooling.gtm.notes}</p>}
            </div>
          </div></div>);

      default: return null;
    }
  };

  // Full-screen takeover once a check has run. Metric health has its own screen
  // (no readiness report), so it's checked first.
  if (rdPhase === 'done' && rdKind === 'metrics') {
    return <MetricHealthScreen results={mhResults} propertyChecked={mhChecked} onReset={() => { setRdPhase('idle'); setMhResults([]); setMhChecked(false); }} />;
  }
  if (rdPhase === 'done' && rdReport) {
    return <LaunchReadinessScreen report={rdReport} drift={rdDrift ?? undefined} baselineNote={rdBaseline} onReset={() => { setRdPhase('idle'); setRdReport(null); setRdDrift(null); setRdBaseline(false); }} />;
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0b1120]">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#0d1525] z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onReset} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0 hidden sm:block"><div className="text-sm font-semibold text-white truncate">Measurement Plan</div><div className="text-xs text-slate-400 truncate">{meta.url}</div></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={openReadiness}
            className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-200 text-sm font-medium flex items-center gap-2 hover:bg-white/[0.1] transition">
            <ShieldCheck size={14} /> <span className="hidden sm:inline">Launch readiness</span>
          </button>
          <ExcelDownloadBtn plan={plan} score={score} scrapeData={scrapeData} />
        </div>
      </header>

      {plan.meta?.source === 'template' && (
        <div className="shrink-0 px-4 lg:px-6 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20 flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200/90 flex-1 min-w-0">
            <span className="font-semibold">Template starting point.</span> AI tailoring was unavailable, so this is a standards-based GA4/GTM baseline — solid to build from, but not customized to your site.
          </p>
          {onRegenerate && (
            <button onClick={onRegenerate}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-medium hover:bg-amber-500/25 transition flex items-center gap-1.5">
              <RefreshCw size={12} /> Regenerate with AI
            </button>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:block shrink-0 w-52 border-r border-white/[0.08] bg-[#0b1120]">
          <nav className="h-full scroll-area py-3 px-2">
            {TABS.map(tab => { const Icon = tab.icon; const active = activeTab === tab.key;
              return (<button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition mb-0.5 ${active ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/10 text-blue-300 border border-blue-500/25 font-semibold' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'}`}>
                <Icon size={16} className="shrink-0" /><span className="truncate">{tab.label}</span></button>);
            })}
          </nav>
        </aside>

        <div className="lg:hidden shrink-0 absolute top-16 left-0 right-0 z-10 h-12 overflow-x-auto no-scrollbar flex gap-1 px-4 border-b border-white/[0.08] bg-[#0d1525] items-center">
          {TABS.map(t => { const Icon = t.icon; return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition font-medium ${activeTab === t.key ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25' : 'text-slate-400'}`}>
              <Icon size={12} />{t.label}</button>);
          })}
        </div>

        <div className="flex-1 scroll-area lg:mt-0 mt-12 bg-[#0b1120]">
          <div className="p-4 lg:p-8 max-w-5xl">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {renderContent()}
            </motion.div>
          </div>
        </div>
      </div>

      {(rdPhase === 'form' || rdPhase === 'loading' || rdPhase === 'error') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#0d1525] border border-white/[0.1] rounded-2xl p-6">
            {rdPhase === 'loading' ? (
              <div className="text-center py-4">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-semibold">
                  {rdKind === 'governance' ? 'Checking for drift…' : rdKind === 'metrics' ? 'Checking metric health…' : 'Running launch readiness…'}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {rdKind === 'governance'
                    ? 'Re-checking your plan setup and comparing it to your last saved run.'
                    : rdKind === 'metrics'
                      ? 'Judging each key event’s recent firing against its trailing baseline.'
                      : rdUrl.trim() ? 'Capturing the live site — this can take up to a minute.' : 'Checking plan consistency…'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-bold text-white">Launch readiness check</h3>
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  Two layers of verification. The quick one already ran from your plan; the full one opens your deployed site to see what actually fires.
                </p>

                {/* Layer 1 — plan consistency (already done, no URL) */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">Quick</span>
                    <span className="text-sm text-white font-medium">Plan consistency</span>
                    <span className="ml-auto text-[11px] text-slate-500">instant · no URL</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Already analyzed from <code className="text-slate-300 break-all">{meta.url}</code> — no need to re-enter it. Running the check below refreshes this.
                  </p>
                </div>

                {/* Layer 2 — live verification (optional URL) */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.05] p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">Full</span>
                    <span className="text-sm text-white font-medium">Live verification</span>
                    <span className="ml-auto text-[11px] text-slate-500">~1 min</span>
                  </div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Staging / live URL <span className="text-slate-600">(optional)</span>
                  </label>
                  <input value={rdUrl} onChange={(e) => setRdUrl(e.target.value)} placeholder="https://staging.example.com"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 mb-2" />
                  <p className="text-[11px] text-slate-500">
                    Point at a URL where GA4/GTM is deployed to capture what fires. Leave blank to re-run plan consistency only.
                  </p>

                  {/* Google connection — turns the 5 GA4/GTM "not verified" checks into real pass/fail. */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    {!gStatus ? (
                      <p className="text-[11px] text-slate-500">Checking Google connection…</p>
                    ) : !gStatus.configured ? (
                      <p className="text-[11px] text-slate-500">GA4/GTM account checks aren&apos;t configured on the server.</p>
                    ) : !gStatus.isAdmin ? (
                      <p className="text-[11px] text-slate-500">
                        Verifying GA4 &amp; GTM accounts needs the operator signed in.{' '}
                        <a href="/leads" target="_blank" rel="noreferrer" className="text-blue-400 underline">Sign in as admin</a>, then reopen this.
                      </p>
                    ) : !gStatus.connected ? (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-2">Connect Google (read-only) to verify your GA4 property &amp; GTM container.</p>
                        <button type="button" onClick={connectGoogle}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-slate-100 text-xs font-medium hover:bg-white/[0.12] transition flex items-center gap-1.5">
                          <ShieldCheck size={12} /> Connect Google
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-emerald-300 flex items-center gap-1"><Check size={12} /> Google connected</span>
                          <button type="button" onClick={disconnectGoogle} disabled={gLoading}
                            className="ml-auto text-[11px] text-slate-500 hover:text-slate-300 underline disabled:opacity-50">Disconnect</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={rdGa4} onChange={(e) => setRdGa4(e.target.value)} placeholder="GA4 property ID"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40" />
                          <input value={rdGtm} onChange={(e) => setRdGtm(e.target.value)} placeholder="GTM-XXXXXXX"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40" />
                        </div>
                        <p className="text-[10px] text-slate-600">Optional — fill either to verify it; leave empty to skip the Google checks.</p>

                        {/* One-time historical backfill — pulls a chosen GA4 date
                            range into metric history so the health check has a
                            baseline. Separate from the daily collector. */}
                        <div className="mt-3 pt-3 border-t border-white/[0.06]">
                          <p className="text-[11px] text-slate-400 mb-1.5">Backfill historical metrics for the GA4 property above (one-time):</p>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[10px] text-slate-500">Start date</span>
                              <input type="date" value={bfStart} onChange={(e) => setBfStart(e.target.value)}
                                className="w-full mt-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/40" />
                            </label>
                            <label className="block">
                              <span className="text-[10px] text-slate-500">End date</span>
                              <input type="date" value={bfEnd} onChange={(e) => setBfEnd(e.target.value)}
                                className="w-full mt-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/40" />
                            </label>
                          </div>
                          <button type="button" onClick={runBackfill}
                            className="mt-2 w-full py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-xs font-medium hover:bg-cyan-500/20 transition flex items-center justify-center gap-1.5">
                            <BarChart3 size={12} /> Backfill &amp; check this range
                          </button>
                          <p className="text-[10px] text-slate-600 mt-1">Pulls daily GA4 event counts for the range into history, then runs the metric health check. Keep ranges within ~a year.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {rdPhase === 'error' && <p className="text-sm text-rose-400 mb-3">{rdError}</p>}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button onClick={runReadiness}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition">
                      Run check
                    </button>
                    <button onClick={() => { setRdPhase('idle'); setRdError(''); }}
                      className="px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 text-sm hover:bg-white/[0.1] transition">
                      Cancel
                    </button>
                  </div>
                  {/* Additive governance action — config-only, no URL. Compares this
                      plan's setup to the last saved run and lights up the DriftSection. */}
                  <button onClick={runGovernance}
                    className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-slate-200 text-sm font-medium hover:bg-white/[0.1] transition flex items-center justify-center gap-2">
                    <History size={14} className="text-slate-400" /> Check for drift since last run
                  </button>
                  {/* Additive metric-health action — judges each key event's recent
                      firing against its trailing baseline (collected metric history). */}
                  <button onClick={runMetricHealth}
                    className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-slate-200 text-sm font-medium hover:bg-white/[0.1] transition flex items-center justify-center gap-2">
                    <BarChart3 size={14} className="text-cyan-400" /> Check metric health
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">
                    Drift compares your setup to the last saved run; metric health checks your key events are still firing.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
