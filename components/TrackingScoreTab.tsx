'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Target, Database, ShieldCheck, Gauge, Share2, Tag,
  ChevronDown, Sparkles, AlertTriangle, CheckCircle, MousePointerClick,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const iconMap: Record<string, any> = { BarChart3, Target, MousePointerClick, Database, ShieldCheck, Gauge, Share2, Tag };

const statusColors: Record<string, string> = {
  excellent: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  good: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  fair: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  poor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  missing: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function TrackingScoreTab({ score }: { score: any }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  if (!score) return null;

  const toggle = (i: number) => { setExpanded(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; }); };

  const circumference = 2 * Math.PI * 88;
  const strokeDashoffset = circumference - (score.total / score.maxTotal) * circumference;

  return (
    <div className="space-y-8">
      {/* Score hero */}
      <div className="bg-ds-card backdrop-blur-2xl rounded-2xl border border-ds-line p-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="relative shrink-0">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <motion.circle cx="100" cy="100" r="88" fill="none" strokeWidth="8" strokeLinecap="round"
                stroke={`url(#scoreGrad)`} strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: 'easeOut' }} transform="rotate(-90 100 100)" />
              <defs><linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={score.grade.startsWith('A') ? '#34d399' : score.grade === 'B' ? '#60a5fa' : score.grade === 'C' ? '#fbbf24' : '#f87171'} />
                <stop offset="100%" stopColor={score.grade.startsWith('A') ? '#22c55e' : score.grade === 'B' ? '#06b6d4' : score.grade === 'C' ? '#f59e0b' : '#ef4444'} />
              </linearGradient></defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-5xl font-bold text-ds-ink">{score.total}</motion.span>
              <span className="text-sm text-ds-muted">/ {score.maxTotal}</span>
            </div>
          </div>
          <div className="flex-1 text-center lg:text-left">
            <div className={`text-4xl font-bold bg-gradient-to-r ${score.grade.startsWith('A') ? 'from-emerald-400 to-green-500' : score.grade === 'B' ? 'from-blue-400 to-cyan-500' : score.grade === 'C' ? 'from-yellow-400 to-amber-500' : 'from-red-500 to-rose-600'} bg-clip-text text-transparent mb-3`}>Grade: {score.grade}</div>
            <p className="text-ds-secondary text-sm leading-relaxed max-w-lg">{score.verdict}</p>
          </div>
        </div>
      </div>

      {/* Detected stack */}
      {score.detectedStack && (
        <div className="bg-ds-card backdrop-blur-xl rounded-2xl border border-ds-line p-6">
          <h3 className="text-ds-ink font-semibold mb-4">Detected Tech Stack</h3>
          <div className="flex flex-wrap gap-6">
            {[{ label: 'Analytics', items: score.detectedStack.analytics }, { label: 'Pixels', items: score.detectedStack.pixels }, { label: 'Behavior', items: score.detectedStack.behavior }].map(g => (
              <div key={g.label}><p className="text-xs text-ds-muted uppercase tracking-wider mb-2">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">{g.items?.length > 0 ? g.items.map((item: string, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-ds-card border border-ds-line text-ds-secondary px-2.5 py-1 rounded-full"><CheckCircle className="w-3 h-3 text-emerald-400" />{item}</span>
                )) : <span className="text-xs text-ds-muted">None detected</span>}</div></div>
            ))}
          </div>
        </div>
      )}

      {/* Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {score.dimensions?.map((dim: any, i: number) => {
          const Icon = iconMap[dim.icon] || BarChart3; const isExp = expanded.has(i);
          const pct = (dim.score / dim.maxScore) * 100;
          return (
            <div key={i} className="bg-ds-card backdrop-blur-xl rounded-2xl border border-ds-line overflow-hidden">
              <button onClick={() => toggle(i)} className="w-full p-5 text-left">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-ds-card flex items-center justify-center"><Icon className="w-4 h-4 text-purple-400" /></div>
                    <div><h4 className="text-ds-ink font-medium text-sm">{dim.name}</h4><span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[dim.status]}`}>{dim.status}</span></div>
                  </div>
                  <div className="flex items-center gap-2"><span className="text-lg font-bold text-ds-ink">{dim.score}</span><span className="text-sm text-ds-muted">/ {dim.maxScore}</span><ChevronDown className={`w-4 h-4 text-ds-muted transition-transform ${isExp ? 'rotate-180' : ''}`} /></div>
                </div>
                <div className="h-1.5 bg-ds-card rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: i * 0.05 }}
                    className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                </div>
              </button>
              <AnimatePresence>{isExp && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-ds-line">
                  <div className="p-5 space-y-3">
                    {dim.findings?.length > 0 && (<div><p className="text-xs text-ds-muted uppercase tracking-wider mb-2">Findings</p><ul className="space-y-1.5">{dim.findings.map((f: string, j: number) => <li key={j} className="text-sm text-ds-secondary flex gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />{f}</li>)}</ul></div>)}
                    {dim.fixes?.length > 0 && (<div><p className="text-xs text-ds-muted uppercase tracking-wider mb-2">Fixes Needed</p><ul className="space-y-1.5">{dim.fixes.map((f: any, j: number) => <li key={j} className="text-sm text-ds-secondary flex gap-2"><AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${f.priority === 'high' ? 'text-red-400' : f.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`} /><div><span>{f.action}</span><span className="text-emerald-400 text-xs ml-2">{f.impact}</span></div></li>)}</ul></div>)}
                  </div>
                </motion.div>
              )}</AnimatePresence>
            </div>);
        })}
      </div>

      {/* Top fixes */}
      {score.topFixes?.length > 0 && (
        <div className="bg-ds-card backdrop-blur-xl rounded-2xl border border-ds-line p-6">
          <h3 className="text-ds-ink font-semibold mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" />Top Priority Fixes</h3>
          <div className="space-y-2">{score.topFixes.map((fix: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-ds-card hover:bg-ds-card transition-colors">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fix.priority === 'high' ? 'bg-red-500/20 text-red-300' : fix.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'}`}>{fix.priority}</span>
              <div className="flex-1"><p className="text-sm text-ds-ink font-medium">{fix.action}</p><p className="text-xs text-ds-muted">{fix.dimension}</p></div>
              <span className="text-xs text-emerald-400 font-mono shrink-0">{fix.impact}</span>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}
