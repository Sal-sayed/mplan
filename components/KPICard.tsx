'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Link2 } from 'lucide-react';

// Matches lib/measurement/types.ts -> Kpi
interface Kpi {
  id: string;
  name: string;
  description: string;
  metric: string;
  linkedEventIds: string[];
}

export default function KPICard({ kpi, index }: { kpi: Kpi; index: number }) {
  const linkedCount = kpi.linkedEventIds?.length || 0;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4, scale: 1.02 }} className="group relative">
      <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-blue-500/0 via-cyan-500/0 to-blue-500/0 group-hover:from-blue-500/30 group-hover:via-cyan-500/30 group-hover:to-blue-500/30 transition-all duration-500 blur-[1px]" />
      <div className="relative bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5 h-full">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-mono text-blue-400 bg-blue-500/15 px-2 py-1 rounded-md font-semibold">{kpi.id}</span>
          {linkedCount > 0 && (
            <span className="text-xs text-slate-500 flex items-center gap-1"><Link2 className="w-3 h-3" />{linkedCount} event{linkedCount === 1 ? '' : 's'}</span>
          )}
        </div>
        <h4 className="text-white font-semibold mb-2 text-sm leading-snug">{kpi.name}</h4>
        {kpi.description && <p className="text-xs text-slate-400 mb-3 leading-relaxed">{kpi.description}</p>}
        <div className="space-y-2 mt-3">
          <div className="flex items-start gap-2 text-xs"><TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span className="text-slate-400">Metric: <span className="text-emerald-300 font-medium">{kpi.metric}</span></span></div>
          {linkedCount > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {kpi.linkedEventIds.map((id) => <span key={id} className="text-[10px] font-mono bg-white/[0.04] text-slate-400 px-1.5 py-0.5 rounded border border-white/[0.05]">{id}</span>)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
