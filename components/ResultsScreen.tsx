'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Target, BarChart3, MousePointerClick, Database,
  ShieldCheck, Settings2, Copy, Check, ChevronDown, FileSpreadsheet, Loader2, Star,
} from 'lucide-react';
import KPICard from './KPICard';
import type { MeasurementPlan, TrackedEvent } from '@/lib/measurement/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABS = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'kpis', label: 'KPIs', icon: BarChart3 },
  { key: 'events', label: 'Events', icon: MousePointerClick },
  { key: 'datalayer', label: 'Data Layer', icon: Database },
  { key: 'consent', label: 'Consent', icon: ShieldCheck },
  { key: 'tooling', label: 'Tooling', icon: Settings2 },
];

interface ResultsScreenProps { plan: MeasurementPlan; score: any; scrapeData: any; onReset: () => void; }

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

export default function ResultsScreen({ plan, score, scrapeData, onReset }: ResultsScreenProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0b1120]">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#0d1525] z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onReset} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0 hidden sm:block"><div className="text-sm font-semibold text-white truncate">Measurement Plan</div><div className="text-xs text-slate-400 truncate">{meta.url}</div></div>
        </div>
        <div className="flex items-center gap-2 shrink-0"><ExcelDownloadBtn plan={plan} score={score} scrapeData={scrapeData} /></div>
      </header>

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
    </div>
  );
}
