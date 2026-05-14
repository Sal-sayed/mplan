'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Activity, Target, BarChart3, Route,
  MousePointerClick, Database, Layers, Settings2,
  TrendingUp, Copy, Check, ChevronDown, ChevronRight, Code,
  AlertTriangle, Search, Lightbulb, Flag,
} from 'lucide-react';
import TrackingScoreTab from './TrackingScoreTab';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import KPICard from './KPICard';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABS = [
  { key: 'features', label: 'Features', icon: Search },
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'objectives', label: 'Objectives', icon: Flag },
  { key: 'kpis', label: 'KPIs', icon: BarChart3 },
  { key: 'journeys', label: 'Journeys', icon: Route },
  { key: 'events', label: 'Events', icon: MousePointerClick },
  { key: 'dimensions', label: 'Dimensions', icon: Database },
  { key: 'conversions', label: 'Conversions', icon: TrendingUp },
  { key: 'implementation', label: 'Roadmap', icon: Layers },
  { key: 'tools', label: 'Tools', icon: Target },
  { key: 'gtm', label: 'GTM Config', icon: Settings2 },
  { key: 'insights', label: 'Insights', icon: Lightbulb },
];

interface ResultsScreenProps { plan: any; score: any; scrapeData: any; onReset: () => void; }

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
    <button onClick={download} disabled={dl} className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-200 text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition disabled:opacity-50">
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

  const SH = ({ title, k, data, count }: { title: string; k: string; data: unknown; count?: number }) => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {count !== undefined && <span className="text-xs bg-blue-500/100/20 text-blue-300 px-2.5 py-0.5 rounded-full font-medium">{count}</span>}
      </div>
      <button onClick={() => copySection(k, data)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.05]/5">
        {copiedSection === k ? <><Check className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500">Copied!</span></> : <><Copy className="w-3.5 h-3.5" />Copy JSON</>}
      </button>
    </div>
  );

  const visibleTabs = TABS.filter(t => {
    if (t.key === 'score' && !score) return false;
    if (t.key === 'features' && !plan.siteFeatures?.detectedFeatures?.length) return false;
    if (t.key === 'gaps' && !plan.siteFeatures?.missingTracking?.length) return false;
    if (t.key === 'gtm' && !plan.gtmConfiguration) return false;
    return true;
  });

  const HIDDEN_KPI = [/customer\s*acquisition/i, /\bcac\b/i, /cost\s*per\s*acquisition/i, /acquisition\s*cost/i];

  const renderContent = () => {
    switch (activeTab) {
      case 'features': return (
        <div><SH title="Detected Features" k="features" data={plan.siteFeatures?.detectedFeatures} count={plan.siteFeatures?.detectedFeatures?.length} />
          <div className="space-y-3">{(plan.siteFeatures?.detectedFeatures || []).map((f: string, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 bg-white/[0.05] rounded-xl border border-white/[0.08] px-6 py-4 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 hover:shadow-purple-500/5 transition-all">
              <span className="text-base font-bold text-purple-500 w-8 shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <div className="w-2 h-2 rounded-full bg-purple-500/100 shrink-0" />
              <span className="text-[15px] text-slate-200">{f}</span>
            </motion.div>
          ))}</div></div>);

      case 'overview': {
        const mustHaveEvents = (plan.events || []).filter((e: any) => e.priority === 'Must Have').length;
        const shouldHaveEvents = (plan.events || []).filter((e: any) => e.priority === 'Should Have').length;
        const niceToHaveEvents = (plan.events || []).filter((e: any) => e.priority === 'Nice to Have').length;
        const highPriorityObj = (plan.businessObjectives || []).filter((o: any) => o.priority === 'High').length;
        const macroConversions = (plan.conversionGoals || []).filter((g: any) => g.type === 'Macro').length;
        const microConversions = (plan.conversionGoals || []).filter((g: any) => g.type === 'Micro').length;
        const totalPhases = plan.implementationPlan?.length || 0;

        return (
        <div className="space-y-6">
          {/* Website Analysis Card */}
          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 rounded-2xl border border-blue-500/25 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Website Analysis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[['URL', plan.websiteInfo?.url], ['Title', plan.websiteInfo?.title], ['Industry', plan.websiteInfo?.industry],
                ['Business Type', plan.websiteInfo?.businessType], ['Scale', plan.websiteInfo?.estimatedScale], ['Primary Goal', plan.websiteInfo?.primaryGoal]].map(([l, v]) => (
                <div key={l as string}><p className="text-xs text-slate-400 uppercase tracking-wider">{l as string}</p><p className="text-slate-200 mt-1 text-sm font-medium">{(v as string) || 'N/A'}</p></div>
              ))}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { l: 'Objectives', v: plan.businessObjectives?.length || 0, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-500/10 border-blue-500/25' },
              { l: 'KPIs', v: plan.kpis?.length || 0, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10 border-blue-500/20' },
              { l: 'Events', v: plan.events?.length || 0, color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-500/10 border-cyan-500/20' },
              { l: 'Dimensions', v: plan.customDimensions?.length || 0, color: 'from-pink-500 to-pink-600', bg: 'bg-pink-500/10 border-pink-500/20' },
            ].map(s => (
              <motion.div key={s.l} whileHover={{ y: -3 }} className={`${s.bg} rounded-xl border p-5 text-center transition-all hover:shadow-lg`}>
                <p className={`text-3xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.v}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">{s.l}</p></motion.div>
            ))}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/[0.05] rounded-2xl border border-white/[0.08] p-5 shadow-none">
              <h4 className="text-sm font-semibold text-white mb-4">Event Priority Breakdown</h4>
              <div className="space-y-3">
                {[
                  { label: 'Must Have', count: mustHaveEvents, total: plan.events?.length || 1, color: 'bg-red-500/100', textColor: 'text-red-400', trackColor: 'bg-red-500/15' },
                  { label: 'Should Have', count: shouldHaveEvents, total: plan.events?.length || 1, color: 'bg-amber-500/100', textColor: 'text-amber-400', trackColor: 'bg-amber-500/15' },
                  { label: 'Nice to Have', count: niceToHaveEvents, total: plan.events?.length || 1, color: 'bg-emerald-500/100', textColor: 'text-emerald-400', trackColor: 'bg-emerald-100' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className={`text-xs font-semibold ${item.textColor}`}>{item.label}</span>
                      <span className="text-xs text-slate-400 font-medium">{item.count} / {plan.events?.length || 0}</span>
                    </div>
                    <div className={`w-full ${item.trackColor} rounded-full h-2.5`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(item.count / item.total) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`${item.color} h-2.5 rounded-full`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.05] rounded-2xl border border-white/[0.08] p-5 shadow-none">
              <h4 className="text-sm font-semibold text-white mb-4">Measurement Summary</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'High Priority Goals', value: highPriorityObj, color: 'text-red-400', bg: 'bg-red-500/10' },
                  { label: 'Macro Conversions', value: macroConversions, color: 'text-blue-400', bg: 'bg-purple-500/10' },
                  { label: 'Micro Conversions', value: microConversions, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Impl. Phases', value: totalPhases, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                  { label: 'User Journeys', value: plan.userJourneys?.length || 0, color: 'text-pink-400', bg: 'bg-pink-500/10' },
                  { label: 'Tools Recommended', value: plan.recommendedTools?.length || 0, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-lg p-3`}>
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>);
      }

      case 'objectives': return (
        <div><SH title="Business Objectives" k="objectives" data={plan.businessObjectives} count={plan.businessObjectives?.length} />
          <div className="space-y-3">{plan.businessObjectives?.map((obj: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3"><span className="text-xs font-mono text-blue-400 bg-blue-500/100/15 px-2 py-1 rounded-md font-semibold">{obj.id}</span><h4 className="text-white font-semibold">{obj.objective}</h4></div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${obj.priority === 'High' ? 'bg-red-500/100/15 text-red-400' : obj.priority === 'Medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>{obj.priority}</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">{obj.description}</p>
              {obj.relatedFeatures?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{obj.relatedFeatures.map((f: string, j: number) => <span key={j} className="text-xs bg-white/[0.05] text-slate-500 px-2 py-0.5 rounded-md">{f}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'kpis': {
        const visibleKpis = (plan.kpis || []).filter((kpi: any) => { const h = `${kpi.name || ''} ${kpi.formula || ''} ${kpi.category || ''}`; return !HIDDEN_KPI.some(re => re.test(h)); });
        return (<div><SH title="KPIs" k="kpis" data={visibleKpis} count={visibleKpis.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{visibleKpis.map((kpi: any, i: number) => <KPICard key={i} kpi={kpi} index={i} />)}</div></div>);
      }

      case 'journeys': return (
        <div><SH title="User Journeys" k="journeys" data={plan.userJourneys} count={plan.userJourneys?.length} />
          <div className="space-y-4">{plan.userJourneys?.map((j: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-6 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <h4 className="text-white font-semibold text-lg mb-1">{j.name}</h4>
              {j.persona && <p className="text-sm text-blue-400 mb-3 font-medium">Persona: {j.persona}</p>}
              <div className="flex flex-wrap gap-2 mb-3">{j.stages?.map((s: string, k: number) => (
                <div key={k} className="flex items-center gap-2"><span className="text-xs bg-blue-500/100/15 text-blue-400 px-3 py-1 rounded-full border border-blue-500/25 font-medium">{s}</span>
                {k < (j.stages?.length || 0) - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}</div>
              ))}</div>
              {j.dropOffRisks?.length > 0 && <div className="flex flex-wrap gap-2">{j.dropOffRisks.map((r: string, k: number) => <span key={k} className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-md border border-red-500/20">{r}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'events': return (
        <div><SH title="GA4 Events" k="events" data={plan.events} count={plan.events?.length} />
          <div className="space-y-2.5">
            {plan.events?.map((event: any, i: number) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-white/[0.04] rounded-xl border border-white/[0.07] overflow-hidden hover:border-blue-500/20 transition-all">
                <button onClick={() => toggleEvent(i)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
                  <span className="text-xs text-slate-600 font-mono w-6 shrink-0 text-right">{String(i + 1).padStart(2, '0')}</span>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: event.priority === 'Must Have' ? '#ef4444' : event.priority === 'Should Have' ? '#f59e0b' : '#10b981' }} />
                  <code className="text-sm text-blue-400 font-mono font-medium flex-1 truncate">{event.eventName}</code>
                  <span className="text-xs text-slate-500 truncate max-w-[200px] hidden sm:block">{event.linkedFeature || event.trigger || ''}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${event.priority === 'Must Have' ? 'bg-red-500/15 text-red-400' : event.priority === 'Should Have' ? 'bg-yellow-500/12 text-yellow-400' : 'bg-emerald-500/12 text-emerald-400'}`}>{event.priority}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 shrink-0 ${expandedEvents.has(i) ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>{expandedEvents.has(i) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-4 pt-2 border-t border-white/[0.05]">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Trigger</p><p className="text-sm text-slate-300">{event.trigger}</p></div>
                        {event.linkedFeature && <div><p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Feature</p><p className="text-sm text-blue-400">{event.linkedFeature}</p></div>}
                        {event.elementSelector && <div><p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Selector</p><code className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded font-mono">{event.elementSelector}</code></div>}
                      </div>
                      {event.parameters?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Parameters</p>
                          <div className="rounded-lg overflow-hidden border border-white/[0.06]">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-white/[0.03]"><th className="text-left px-3 py-2 text-slate-500 font-medium">Name</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Type</th><th className="text-left px-3 py-2 text-slate-500 font-medium">Example</th></tr></thead>
                              <tbody>{event.parameters.map((p: any, j: number) => (
                                <tr key={j} className="border-t border-white/[0.04]"><td className="px-3 py-1.5 text-cyan-400 font-mono">{p.name}</td><td className="px-3 py-1.5 text-slate-500">{p.type}</td><td className="px-3 py-1.5 text-slate-500 font-mono">{p.example}</td></tr>
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

      case 'dimensions': return (
        <div><SH title="Custom Dimensions" k="dimensions" data={plan.customDimensions} count={plan.customDimensions?.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{plan.customDimensions?.map((d: any, i: number) => (
            <motion.div key={i} whileHover={{ y: -2 }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-center justify-between mb-2"><h4 className="text-white font-semibold text-sm">{d.name}</h4><span className="text-xs bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-medium">{d.scope}</span></div>
              <p className="text-sm text-slate-500 mb-2">{d.description}</p>
              {d.exampleValues?.length > 0 && <div className="flex flex-wrap gap-1">{d.exampleValues.map((v: string, j: number) => <span key={j} className="text-xs bg-white/[0.05] text-slate-300 px-2 py-0.5 rounded-md font-mono">{v}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'conversions': return (
        <div><SH title="Conversion Goals" k="conversions" data={plan.conversionGoals} count={plan.conversionGoals?.length} />
          <div className="space-y-3">{plan.conversionGoals?.map((g: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-start justify-between"><div><div className="flex items-center gap-2 mb-1"><h4 className="text-white font-semibold text-sm">{g.name}</h4><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.type === 'Macro' ? 'bg-blue-500/100/15 text-blue-400' : 'bg-blue-500/15 text-blue-400'}`}>{g.type}</span></div><p className="text-sm text-slate-500">{g.businessImpact}</p></div>{g.value && <span className="text-sm text-emerald-400 font-mono font-semibold">{g.value}</span>}</div>
              <div className="mt-2"><code className="text-xs text-blue-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded-md font-medium">{g.event}</code>{g.expectedRate && <span className="text-xs text-slate-400 ml-2">Rate: {g.expectedRate}</span>}</div>
            </motion.div>))}</div></div>);

      case 'implementation': return (
        <div><SH title="Implementation Plan" k="implementation" data={plan.implementationPlan} count={plan.implementationPlan?.length} />
          <div className="space-y-4">{plan.implementationPlan?.map((p: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-6 relative overflow-hidden hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="absolute top-0 right-0 w-14 h-14 bg-gradient-to-bl from-purple-100 to-transparent rounded-bl-3xl flex items-start justify-end p-2"><span className="text-xl font-bold text-purple-300">{p.phase}</span></div>
              <h4 className="text-white font-semibold text-lg mb-1">{p.phaseName}</h4><p className="text-sm text-slate-400 mb-3 font-medium">Duration: {p.duration}</p>
              {p.tasks?.length > 0 && <ul className="space-y-1 mb-3">{p.tasks.map((t: string, j: number) => <li key={j} className="text-sm text-slate-300 flex gap-2"><span className="text-purple-500 shrink-0">-</span>{t}</li>)}</ul>}
              {p.deliverables?.length > 0 && <div className="flex flex-wrap gap-2">{p.deliverables.map((d: string, j: number) => <span key={j} className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/20">{d}</span>)}</div>}
            </motion.div>))}</div></div>);

      case 'tools': return (
        <div><SH title="Recommended Tools" k="tools" data={plan.recommendedTools} count={plan.recommendedTools?.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{plan.recommendedTools?.map((t: any, i: number) => (
            <motion.div key={i} whileHover={{ y: -2 }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white/[0.05] rounded-xl border border-white/[0.08] p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="flex items-start justify-between mb-2"><h4 className="text-white font-semibold">{t.name}</h4><span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${t.priority === 'Essential' ? 'bg-red-500/100/15 text-red-400' : t.priority === 'Recommended' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>{t.priority}</span></div>
              <p className="text-sm text-slate-500 mb-2">{t.purpose}</p>{t.estimatedCost && <p className="text-xs text-slate-400 font-medium">Cost: {t.estimatedCost}</p>}
            </motion.div>))}</div></div>);

      case 'gtm': return (
        <div><SH title="GTM Configuration" k="gtm" data={plan.gtmConfiguration} />
          <div className="space-y-6">{['tags', 'triggers', 'variables'].map(section => {
            const items = plan.gtmConfiguration?.[section]; if (!items?.length) return null;
            return (<div key={section}><h4 className="text-white font-semibold mb-3 capitalize">{section}</h4>
              <div className="bg-white/[0.03] rounded-xl p-4 space-y-2 border border-white/[0.08]">{items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2"><Code className="w-3.5 h-3.5 text-indigo-500 shrink-0" /><code className="text-sm text-slate-300 font-mono">{typeof item === 'string' ? item : JSON.stringify(item)}</code></div>
              ))}</div></div>);
          })}</div></div>);

      case 'insights': return (
        <div><SH title="Strategic Insights" k="insights" data={plan.insights} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[
            { key: 'strengths', title: 'Strengths', color: 'emerald', icon: '+' }, { key: 'opportunities', title: 'Opportunities', color: 'blue', icon: '*' },
            { key: 'risks', title: 'Risks', color: 'red', icon: '!' }, { key: 'quickWins', title: 'Quick Wins', color: 'yellow', icon: '>' },
            { key: 'competitiveBenchmarks', title: 'Benchmarks', color: 'purple', icon: '#' }].map(s => {
            const items = plan.insights?.[s.key]; if (!items?.length) return null;
            const cm: Record<string, string> = { emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400', red: 'bg-red-500/10 border-red-500/20 text-red-400', yellow: 'bg-amber-500/10 border-amber-500/20 text-amber-400', purple: 'bg-purple-500/10 border-blue-500/25 text-blue-400' };
            const c = cm[s.color];
            return (<motion.div key={s.key} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`rounded-xl border p-5 ${c.split(' ').slice(0, 2).join(' ')}`}>
              <h4 className={`font-semibold mb-3 ${c.split(' ')[2]}`}>{s.title}</h4>
              <ul className="space-y-2">{items.map((item: string, j: number) => <li key={j} className="text-sm text-slate-300 flex gap-2"><span className={`shrink-0 font-bold ${c.split(' ')[2]}`}>{s.icon}</span>{item}</li>)}</ul>
            </motion.div>);
          })}</div></div>);

      default: return null;
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0b1120]">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#0d1525] z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onReset} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition shrink-0"><ArrowLeft size={18} /></button>
          <div className="min-w-0 hidden sm:block"><div className="text-sm font-semibold text-white truncate">{plan.websiteInfo?.title || 'Results'}</div><div className="text-xs text-slate-400 truncate">{plan.websiteInfo?.url}</div></div>
        </div>
        <div className="flex items-center gap-2 shrink-0" />
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:block shrink-0 w-52 border-r border-white/[0.08] bg-[#0b1120]">
          <nav className="h-full scroll-area py-3 px-2">
            {visibleTabs.map(tab => { const Icon = tab.icon; const active = activeTab === tab.key;
              return (<button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition mb-0.5 ${active ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/10 text-blue-300 border border-blue-500/25 font-semibold shadow-none' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'}`}>
                <Icon size={16} className="shrink-0" /><span className="truncate">{tab.label}</span></button>);
            })}
          </nav>
        </aside>

        <div className="lg:hidden shrink-0 absolute top-16 left-0 right-0 z-10 h-12 overflow-x-auto no-scrollbar flex gap-1 px-4 border-b border-white/[0.08] bg-[#0d1525] items-center">
          {visibleTabs.map(t => { const Icon = t.icon; return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition font-medium ${activeTab === t.key ? 'bg-blue-500/100/15 text-blue-300 border border-blue-500/25' : 'text-slate-400'}`}>
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
