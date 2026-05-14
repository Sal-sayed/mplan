'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { Check } from 'lucide-react';
import { LOADING_MESSAGES, getMessageTier } from '@/lib/loading-messages';
import EventNetworkAnimation from './loading/EventNetworkAnimation';

const STAGES = [
  { key: 'scraping', label: 'Scanning website', desc: 'Reading buttons, forms, and CTAs' },
  { key: 'scoring', label: 'Auditing tracking', desc: 'Detecting GA4, GTM, and pixels' },
  { key: 'generating', label: 'Generating plan', desc: 'Writing events, KPIs, and dimensions' },
  { key: 'delivering', label: 'Delivering to inbox', desc: 'Building Excel and sending email' },
];

interface Props { stage: string; progress: number; url: string; email: string; mode?: 'new' | 'audit'; }

export default function LoadingScreen({ stage, progress, url, email, mode }: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === stage);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [messageIdx, setMessageIdx] = useState(0);
  const startTime = useRef<number>(Date.now());

  useEffect(() => { const i = setInterval(() => { setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000)); }, 1000); return () => clearInterval(i); }, []);
  useEffect(() => { const i = setInterval(() => { setMessageIdx(n => n + 1); }, 4000); return () => clearInterval(i); }, []);

  const tier = getMessageTier(elapsedSec);
  const messages = LOADING_MESSAGES[tier];
  const currentMessage = messages[messageIdx % messages.length];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as any)[currentMessage.icon] || Icons.Loader2;
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Adjust stage labels based on mode
  const stages = STAGES.map(s => {
    if (s.key === 'generating' && mode === 'audit') {
      return { ...s, label: 'Generating audit', desc: 'Analyzing gaps and recommending events' };
    }
    return s;
  });

  return (
    <div className="h-full w-full flex items-center justify-center p-6 overflow-hidden">
      <div className="w-full max-w-lg">
        <div className="mb-8"><EventNetworkAnimation /></div>

        {/* URL + Email */}
        <div className="text-center mb-6">
          <p className="text-sm text-slate-300 truncate">{url}</p>
          <p className="text-xs text-slate-500 mt-1 truncate">&rarr; {email}</p>
        </div>

        {/* Stages */}
        <div className="space-y-2 mb-8">
          {stages.map((s, i) => {
            const done = i < currentIdx; const active = i === currentIdx;
            return (
              <div key={s.key} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${active ? 'bg-blue-500/10 border-blue-500/20' : done ? 'bg-white/[0.03] border-white/[0.05] opacity-60' : 'bg-transparent border-transparent opacity-30'}`}>
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500' : active ? 'bg-blue-500' : 'bg-white/10'}`}>
                  {done ? <Check size={11} className="text-white" /> : active ? <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> : null}
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${done || active ? 'text-white' : 'text-slate-600'}`}>{s.label}</div>
                  <div className="text-xs text-slate-500 truncate">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden mb-2">
          <motion.div initial={{ width: '0%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }}
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-400 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
          </motion.div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-8"><span>{progress}%</span><span className="font-mono">{timeDisplay}</span></div>

        {/* Rotating message */}
        <div className="relative min-h-[80px]" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait">
            <motion.div key={`${tier}-${messageIdx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
              className="flex items-start gap-3 px-4 py-4 bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-xl">
              <div className={`mt-0.5 shrink-0 ${tier === 'tactical' ? 'text-slate-400' : tier === 'permission' ? 'text-amber-400' : 'text-blue-400'}`}><IconComponent size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white leading-relaxed">{currentMessage.text}</p>
                {tier === 'permission' && <p className="text-xs text-slate-500 mt-1">We&apos;ll keep working in the background</p>}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
