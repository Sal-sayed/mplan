'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, BarChart3, Zap, Layers, Wrench, Route, TrendingUp, Lightbulb,
  Copy, Check, ChevronDown, ChevronRight, Shield, Flag, HeartPulse,
  Search, AlertTriangle, Code, Mail,
} from 'lucide-react';
import KPICard from './KPICard';
import TrackingScoreTab from './TrackingScoreTab';
import DirectDownloadButtons from './DirectDownloadButtons';
import EmailExportModal from './EmailExportModal';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MeasurementPlanDisplayProps {
  plan: any;
  score?: any;
  scrapeData?: any;
}

const tabs = [
  { id: 'health', label: 'Health Score', icon: HeartPulse },
  { id: 'features', label: 'Detected Features', icon: Search },
  { id: 'gaps', label: 'Tracking Gaps', icon: AlertTriangle },
  { id: 'overview', label: 'Overview', icon: Target },
  { id: 'objectives', label: 'Objectives', icon: Flag },
  { id: 'kpis', label: 'KPIs', icon: BarChart3 },
  { id: 'journeys', label: 'User Journeys', icon: Route },
  { id: 'events', label: 'Events', icon: Zap },
  { id: 'dimensions', label: 'Dimensions', icon: Layers },
  { id: 'conversions', label: 'Conversions', icon: TrendingUp },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'gtm', label: 'GTM Config', icon: Code },
  { id: 'implementation', label: 'Implementation', icon: Shield },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
];

export default function MeasurementPlanDisplay({ plan, score, scrapeData }: MeasurementPlanDisplayProps) {
  const [activeTab, setActiveTab] = useState(score ? 'health' : 'overview');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);

  const copySection = useCallback((section: string, data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  const toggleEvent = useCallback((index: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const SectionHeader = ({ title, sectionKey, data, count }: { title: string; sectionKey: string; data: unknown; count?: number }) => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {count !== undefined && (
          <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{count} items</span>
        )}
      </div>
      <button onClick={() => copySection(sectionKey, data)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
        {copiedSection === sectionKey ? (<><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>) : (<><Copy className="w-3.5 h-3.5" />Copy JSON</>)}
      </button>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'health':
        return <TrackingScoreTab key="health" score={score} />;

      case 'features':
        return (
          <motion.div key="features" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Detected Features" sectionKey="features" data={plan.siteFeatures?.detectedFeatures} count={plan.siteFeatures?.detectedFeatures?.length} />
            <div className="flex flex-wrap gap-2">
              {(plan.siteFeatures?.detectedFeatures || []).map((f: string, i: number) => (
                <motion.span key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                  className="text-sm bg-purple-500/10 text-purple-300 border border-purple-500/20 px-3 py-1.5 rounded-full">
                  {f}
                </motion.span>
              ))}
              {(!plan.siteFeatures?.detectedFeatures?.length) && (
                <p className="text-slate-500 text-sm">No features data available. Run a deep scrape to populate this section.</p>
              )}
            </div>
          </motion.div>
        );

      case 'gaps':
        return (
          <motion.div key="gaps" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Tracking Gaps" sectionKey="gaps" data={plan.siteFeatures?.missingTracking} count={plan.siteFeatures?.missingTracking?.length} />
            <div className="space-y-3">
              {(plan.siteFeatures?.missingTracking || []).map((gap: string, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-300">{gap}</p>
                </motion.div>
              ))}
              {(!plan.siteFeatures?.missingTracking?.length) && (
                <p className="text-slate-500 text-sm">No tracking gaps data available.</p>
              )}
            </div>
          </motion.div>
        );

      case 'overview':
        return (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-gradient-to-br from-purple-600/10 to-blue-600/10 rounded-2xl border border-purple-500/20 p-6">
              <h3 className="text-lg font-bold text-white mb-4">Website Analysis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[['URL', plan.websiteInfo?.url], ['Title', plan.websiteInfo?.title], ['Industry', plan.websiteInfo?.industry],
                  ['Business Type', plan.websiteInfo?.businessType], ['Scale', plan.websiteInfo?.estimatedScale], ['Primary Goal', plan.websiteInfo?.primaryGoal],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{label as string}</p>
                    <p className="text-white mt-1 text-sm">{(value as string) || 'N/A'}</p>
                  </div>
                ))}
              </div>
              {plan.websiteInfo?.detectedTech?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Detected Technology</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.websiteInfo.detectedTech.map((t: string, i: number) => (
                      <span key={i} className="text-xs bg-white/5 text-slate-300 px-2 py-1 rounded-md">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[{ label: 'Objectives', value: plan.businessObjectives?.length || 0 },
                { label: 'KPIs', value: plan.kpis?.length || 0 },
                { label: 'Events', value: plan.events?.length || 0 },
                { label: 'Dimensions', value: plan.customDimensions?.length || 0 },
              ].map(stat => (
                <motion.div key={stat.label} whileHover={{ y: -2 }} className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-4 text-center">
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">{stat.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </div>
            {plan.insights && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plan.insights.quickWins?.length > 0 && (
                  <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-5">
                    <h4 className="text-emerald-400 font-semibold mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4" />Quick Wins</h4>
                    <ul className="space-y-2">
                      {plan.insights.quickWins.slice(0, 3).map((win: string, i: number) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-emerald-400 shrink-0">+</span>{win}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {plan.insights.opportunities?.length > 0 && (
                  <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 p-5">
                    <h4 className="text-blue-400 font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" />Opportunities</h4>
                    <ul className="space-y-2">
                      {plan.insights.opportunities.slice(0, 3).map((opp: string, i: number) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-blue-400 shrink-0">*</span>{opp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        );

      case 'objectives':
        return (
          <motion.div key="objectives" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Business Objectives" sectionKey="objectives" data={plan.businessObjectives} count={plan.businessObjectives?.length} />
            <div className="space-y-3">
              {plan.businessObjectives?.map((obj: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5 hover:border-purple-500/20 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded-md">{obj.id}</span>
                      <h4 className="text-white font-semibold">{obj.objective}</h4>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${obj.priority === 'High' ? 'bg-red-500/20 text-red-300' : obj.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>{obj.priority}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">{obj.description}</p>
                  {obj.relatedFeatures?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {obj.relatedFeatures.map((f: string, j: number) => (
                        <span key={j} className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-md">{f}</span>
                      ))}
                    </div>
                  )}
                  {obj.timeframe && <p className="text-xs text-slate-500 mt-2">Timeframe: {obj.timeframe}</p>}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'kpis':
        return (
          <motion.div key="kpis" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Key Performance Indicators" sectionKey="kpis" data={plan.kpis} count={plan.kpis?.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plan.kpis?.map((kpi: any, i: number) => (<KPICard key={i} kpi={kpi} index={i} />))}
            </div>
          </motion.div>
        );

      case 'journeys':
        return (
          <motion.div key="journeys" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="User Journeys" sectionKey="journeys" data={plan.userJourneys} count={plan.userJourneys?.length} />
            <div className="space-y-6">
              {plan.userJourneys?.map((journey: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-6">
                  <h4 className="text-white font-semibold text-lg mb-1">{journey.name}</h4>
                  {journey.persona && <p className="text-sm text-purple-300 mb-3">Persona: {journey.persona}</p>}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {journey.stages?.map((stage: string, j: number) => (
                      <div key={j} className="flex items-center gap-2">
                        <span className="text-xs bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/20">{stage}</span>
                        {j < (journey.stages?.length || 0) - 1 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                      </div>
                    ))}
                  </div>
                  {journey.dropOffRisks?.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Drop-off Risks</p>
                      <div className="flex flex-wrap gap-2">
                        {journey.dropOffRisks.map((risk: string, j: number) => (
                          <span key={j} className="text-xs bg-red-500/10 text-red-300 px-2 py-1 rounded-md border border-red-500/10">{risk}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'events':
        return (
          <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="GA4 Events" sectionKey="events" data={plan.events} count={plan.events?.length} />
            <div className="space-y-2">
              {plan.events?.map((event: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] overflow-hidden hover:border-purple-500/20 transition-all">
                  <button onClick={() => toggleEvent(i)} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex items-center gap-3 flex-wrap">
                      <code className="text-sm text-cyan-400 font-mono bg-cyan-500/10 px-2 py-1 rounded-md">{event.eventName}</code>
                      <span className="text-xs text-slate-500">{event.category}</span>
                      {event.linkedFeature && <span className="text-xs bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full">{event.linkedFeature}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${event.priority === 'Must Have' ? 'bg-red-500/20 text-red-300' : event.priority === 'Should Have' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>{event.priority}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedEvents.has(i) ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  <AnimatePresence>
                    {expandedEvents.has(i) && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5">
                        <div className="p-4 space-y-3">
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Fires on</p>
                            <p className="text-sm text-slate-300 mt-1">{event.trigger}</p>
                          </div>
                          {event.elementSelector && (
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wider">Selector</p>
                              <code className="text-xs text-cyan-300 bg-black/20 px-2 py-1 rounded-md mt-1 inline-block">{event.elementSelector}</code>
                            </div>
                          )}
                          {event.parameters?.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Parameters</p>
                              <div className="bg-black/20 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead><tr className="border-b border-white/5">
                                    <th className="text-left p-2 text-slate-500 font-medium">Name</th>
                                    <th className="text-left p-2 text-slate-500 font-medium">Type</th>
                                    <th className="text-left p-2 text-slate-500 font-medium">Example</th>
                                  </tr></thead>
                                  <tbody>
                                    {event.parameters.map((param: any, j: number) => (
                                      <tr key={j} className="border-b border-white/[0.03]">
                                        <td className="p-2 text-cyan-300 font-mono">{param.name}</td>
                                        <td className="p-2 text-slate-400">{param.type}</td>
                                        <td className="p-2 text-slate-400">{param.example}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'dimensions':
        return (
          <motion.div key="dimensions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Custom Dimensions" sectionKey="dimensions" data={plan.customDimensions} count={plan.customDimensions?.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plan.customDimensions?.map((dim: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -2 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-white font-semibold text-sm">{dim.name}</h4>
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">{dim.scope}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-2">{dim.description}</p>
                  {dim.captureMethod && <p className="text-xs text-slate-500 mb-2">Capture: {dim.captureMethod}</p>}
                  {dim.exampleValues?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dim.exampleValues.map((v: string, j: number) => (
                        <span key={j} className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-md font-mono">{v}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'conversions':
        return (
          <motion.div key="conversions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Conversion Goals" sectionKey="conversions" data={plan.conversionGoals} count={plan.conversionGoals?.length} />
            <div className="space-y-3">
              {plan.conversionGoals?.map((goal: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5 hover:border-purple-500/20 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-semibold text-sm">{goal.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${goal.type === 'Macro' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>{goal.type}</span>
                      </div>
                      <p className="text-sm text-slate-400">{goal.businessImpact}</p>
                    </div>
                    <div className="text-right">
                      {goal.value && <span className="text-sm text-emerald-400 font-mono">{goal.value}</span>}
                      {goal.expectedRate && <p className="text-xs text-slate-500 mt-1">Rate: {goal.expectedRate}</p>}
                    </div>
                  </div>
                  <div className="mt-3"><code className="text-xs text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-md">{goal.event}</code></div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'tools':
        return (
          <motion.div key="tools" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Recommended Tools" sectionKey="tools" data={plan.recommendedTools} count={plan.recommendedTools?.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plan.recommendedTools?.map((tool: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -2 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-semibold">{tool.name}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tool.priority === 'Essential' ? 'bg-red-500/20 text-red-300' : tool.priority === 'Recommended' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>{tool.priority}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-2">{tool.purpose}</p>
                  {tool.estimatedCost && <p className="text-xs text-slate-500">Cost: {tool.estimatedCost}</p>}
                  {tool.alternativeTools?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tool.alternativeTools.map((alt: string, j: number) => (
                        <span key={j} className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-md">{alt}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'gtm':
        return (
          <motion.div key="gtm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="GTM Configuration" sectionKey="gtm" data={plan.gtmConfiguration} />
            <div className="space-y-6">
              {['tags', 'triggers', 'variables'].map(section => {
                const items = plan.gtmConfiguration?.[section];
                if (!items?.length) return null;
                return (
                  <div key={section}>
                    <h4 className="text-white font-semibold mb-3 capitalize">{section}</h4>
                    <div className="bg-black/20 rounded-xl p-4 space-y-2">
                      {items.map((item: string, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <code className="text-sm text-slate-300 font-mono">{typeof item === 'string' ? item : JSON.stringify(item)}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!plan.gtmConfiguration && <p className="text-slate-500 text-sm">No GTM configuration data available.</p>}
            </div>
          </motion.div>
        );

      case 'implementation':
        return (
          <motion.div key="impl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Implementation Plan" sectionKey="implementation" data={plan.implementationPlan} count={plan.implementationPlan?.length} />
            <div className="space-y-4">
              {plan.implementationPlan?.map((phase: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-3xl flex items-start justify-end p-2">
                    <span className="text-2xl font-bold text-purple-500/30">{phase.phase}</span>
                  </div>
                  <h4 className="text-white font-semibold text-lg mb-1">{phase.phaseName}</h4>
                  <p className="text-sm text-slate-500 mb-4">Duration: {phase.duration}</p>
                  {phase.tasks?.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tasks</p>
                      <ul className="space-y-1.5">
                        {phase.tasks.map((task: string, j: number) => (
                          <li key={j} className="text-sm text-slate-300 flex gap-2"><span className="text-purple-400 shrink-0">-</span>{task}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {phase.deliverables?.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Deliverables</p>
                      <div className="flex flex-wrap gap-2">
                        {phase.deliverables.map((del: string, j: number) => (
                          <span key={j} className="text-xs bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded-md">{del}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );

      case 'insights':
        return (
          <motion.div key="insights" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionHeader title="Strategic Insights" sectionKey="insights" data={plan.insights} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'strengths', title: 'Strengths', color: 'emerald', icon: '+' },
                { key: 'opportunities', title: 'Opportunities', color: 'blue', icon: '*' },
                { key: 'risks', title: 'Risks', color: 'red', icon: '!' },
                { key: 'quickWins', title: 'Quick Wins', color: 'yellow', icon: '>' },
                { key: 'competitiveBenchmarks', title: 'Benchmarks', color: 'purple', icon: '#' },
              ].map(section => {
                const items = plan.insights?.[section.key];
                if (!items?.length) return null;
                const colorMap: Record<string, string> = {
                  emerald: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400',
                  blue: 'bg-blue-500/5 border-blue-500/20 text-blue-400',
                  red: 'bg-red-500/5 border-red-500/20 text-red-400',
                  yellow: 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400',
                  purple: 'bg-purple-500/5 border-purple-500/20 text-purple-400',
                };
                const colors = colorMap[section.color];
                return (
                  <motion.div key={section.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border p-5 ${colors.split(' ').slice(0, 2).join(' ')}`}>
                    <h4 className={`font-semibold mb-3 ${colors.split(' ')[2]}`}>{section.title}</h4>
                    <ul className="space-y-2">
                      {items.map((item: string, j: number) => (
                        <li key={j} className="text-sm text-slate-300 flex gap-2">
                          <span className={`shrink-0 ${colors.split(' ')[2]}`}>{section.icon}</span>{item}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  // Filter tabs: skip health/features/gaps if no data
  const visibleTabs = tabs.filter(tab => {
    if (tab.id === 'health' && !score) return false;
    if (tab.id === 'features' && !plan.siteFeatures?.detectedFeatures?.length) return false;
    if (tab.id === 'gaps' && !plan.siteFeatures?.missingTracking?.length) return false;
    if (tab.id === 'gtm' && !plan.gtmConfiguration) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Measurement Plan Generated</h2>
          <p className="text-slate-400 text-sm mt-1">{plan.websiteInfo?.url || 'Website'} - {plan.websiteInfo?.businessType || 'Analysis Complete'}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowEmailModal(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold flex items-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all"
          >
            <Mail size={16} /> Email me all formats
          </button>
          <div className="h-8 w-px bg-white/10" />
          <span className="text-xs text-white/50">Or download directly:</span>
          <DirectDownloadButtons plan={plan} score={score} scrapeData={scrapeData} />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-300 ${
                activeTab === tab.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>

      <EmailExportModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        plan={plan}
        score={score}
        scrapeData={scrapeData}
      />
    </motion.div>
  );
}
