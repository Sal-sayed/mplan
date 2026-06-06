'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Activity,
  FileText,
  Layers,
  Target,
  BarChart3,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface LiveStats {
  gtmContainers?: number;
  eventsFound?: number;
  pagesScanned?: number;
  toolsActive?: number;
  objectives?: number;
  kpis?: number;
  events?: number;
  dimensions?: number;
}

interface Props {
  stats: LiveStats;
  mode: 'new' | 'audit';
}

interface StatBox {
  icon: LucideIcon;
  label: string;
  value: number;
  iconText: string;
  border: string;
  glow: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === display) return;
    const duration = 600;
    const steps = 15;
    const delta = (value - display) / steps;
    let current = display;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      current += delta;
      if (step >= steps) {
        setDisplay(value);
        clearInterval(interval);
      } else {
        setDisplay(Math.round(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
    // intentional: re-run only on value change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}

export default function StatsDashboard({ stats, mode }: Props) {
  const boxes: StatBox[] = mode === 'audit'
    ? [
        { icon: Database, label: 'GTM Containers', value: stats.gtmContainers ?? 0, iconText: 'text-green-400',  border: 'border-green-500/20',  glow: 'bg-green-500/10' },
        { icon: Activity, label: 'Events Found',   value: stats.eventsFound ?? 0,   iconText: 'text-blue-400',   border: 'border-blue-500/20',   glow: 'bg-blue-500/10' },
        { icon: FileText, label: 'Pages Scanned',  value: stats.pagesScanned ?? 0,  iconText: 'text-orange-400', border: 'border-orange-500/20', glow: 'bg-orange-500/10' },
        { icon: Layers,   label: 'Tools Active',   value: stats.toolsActive ?? 0,   iconText: 'text-purple-400', border: 'border-purple-500/20', glow: 'bg-purple-500/10' },
      ]
    : [
        { icon: Target,    label: 'Objectives', value: stats.objectives ?? 0, iconText: 'text-green-400',  border: 'border-green-500/20',  glow: 'bg-green-500/10' },
        { icon: BarChart3, label: 'KPIs',       value: stats.kpis ?? 0,       iconText: 'text-blue-400',   border: 'border-blue-500/20',   glow: 'bg-blue-500/10' },
        { icon: Activity,  label: 'Events',     value: stats.events ?? 0,     iconText: 'text-orange-400', border: 'border-orange-500/20', glow: 'bg-orange-500/10' },
        { icon: Sparkles,  label: 'Dimensions', value: stats.dimensions ?? 0, iconText: 'text-purple-400', border: 'border-purple-500/20', glow: 'bg-purple-500/10' },
      ];

  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.08]">
        <div className="text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">
          {mode === 'audit' ? 'Discovery Stats' : 'Plan Statistics'}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-3 p-4 content-start">
        {boxes.map((box, i) => {
          const Icon = box.icon;
          return (
            <motion.div
              key={box.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              className={`relative bg-white/[0.02] border ${box.border} rounded-lg p-3 overflow-hidden`}
            >
              <div className={`pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl opacity-50 ${box.glow}`} />
              <Icon className={`w-4 h-4 ${box.iconText} mb-2 opacity-80`} strokeWidth={1.6} />
              <div className={`text-3xl font-semibold ${box.iconText} font-mono leading-none`}>
                <AnimatedNumber value={box.value} />
              </div>
              <div className="text-[9px] uppercase tracking-[0.1em] text-white/50 mt-1 leading-tight">
                {box.label}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-white/[0.08] text-[10px] text-white/50 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        <span>Numbers update as we discover more</span>
      </div>
    </div>
  );
}
