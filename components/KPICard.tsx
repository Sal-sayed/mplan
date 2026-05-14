'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Clock, User } from 'lucide-react';

interface KPI { id: string; name: string; businessObjectiveId: string; formula: string; target: string; frequency: string; owner: string; }

export default function KPICard({ kpi, index }: { kpi: KPI; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4, scale: 1.02 }} className="group relative">
      <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-blue-500/0 via-cyan-500/0 to-blue-500/0 group-hover:from-blue-500/30 group-hover:via-cyan-500/30 group-hover:to-blue-500/30 transition-all duration-500 blur-[1px]" />
      <div className="relative bg-white/[0.05] backdrop-blur-xl rounded-xl border border-white/[0.08] p-5 h-full">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-mono text-blue-400 bg-blue-500/15 px-2 py-1 rounded-md font-semibold">{kpi.id}</span>
          <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{kpi.frequency}</span>
        </div>
        <h4 className="text-white font-semibold mb-2 text-sm leading-snug">{kpi.name}</h4>
        <div className="space-y-2 mt-3">
          <div className="flex items-center gap-2 text-xs"><TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span className="text-slate-400 truncate">Target: <span className="text-emerald-300 font-medium">{kpi.target}</span></span></div>
          <div className="text-xs text-slate-400 bg-white/[0.03] rounded-lg p-2 font-mono border border-white/[0.05]">{kpi.formula}</div>
          <div className="flex items-center gap-2 text-xs text-slate-500 pt-1"><User className="w-3 h-3 shrink-0" /><span className="truncate">{kpi.owner}</span></div>
        </div>
      </div>
    </motion.div>
  );
}
