'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Scan, BarChart3, FileCode, CheckCircle } from 'lucide-react';

const stages = [
  {
    icon: Scan,
    label: 'Deep scanning website...',
    detail: 'Crawling homepage + sub-pages with Playwright, extracting every button, form, and CTA',
  },
  {
    icon: Brain,
    label: 'Computing health score...',
    detail: 'Auditing analytics stack, consent, pixels, and data layer across 8 dimensions',
  },
  {
    icon: BarChart3,
    label: 'Generating measurement plan...',
    detail: 'AI analyzing 15KB+ of structured site data to build specific events and KPIs',
  },
  {
    icon: FileCode,
    label: 'Building event map...',
    detail: 'Mapping 20-80 events to real buttons, forms, and features found on site',
  },
  {
    icon: CheckCircle,
    label: 'Finalizing...',
    detail: 'Compiling health score, measurement plan, GTM config, and implementation roadmap',
  },
];

interface LoadingAgentProps {
  currentStage: number;
}

export default function LoadingAgent({ currentStage }: LoadingAgentProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-xl mx-auto"
    >
      <div className="bg-white/[0.05] backdrop-blur-2xl rounded-2xl border border-white/10 p-8">
        {/* AI Brain visualization */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="w-24 h-24 rounded-full border-2 border-purple-500/30 flex items-center justify-center"
            >
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 rounded-full border-2 border-blue-500/40 flex items-center justify-center"
              >
                <Brain className="w-8 h-8 text-purple-400" />
              </motion.div>
            </motion.div>

            {/* Orbiting dots */}
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ rotate: 360 }}
                transition={{
                  duration: 3 + i,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: i * 0.5,
                }}
                className="absolute inset-0"
                style={{ transformOrigin: 'center' }}
              >
                <div
                  className="w-2 h-2 rounded-full bg-purple-400"
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                />
              </motion.div>
            ))}

            {/* Pulse rings */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border border-purple-500/20"
            />
          </div>
        </div>

        {/* Progress stages */}
        <div className="space-y-3">
          {stages.map((stage, index) => {
            const isActive = index === currentStage;
            const isDone = index < currentStage;
            const Icon = stage.icon;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-500 ${
                  isActive
                    ? 'bg-purple-500/10 border border-purple-500/20'
                    : isDone
                    ? 'opacity-60'
                    : 'opacity-30'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isDone
                      ? 'bg-emerald-500/20'
                      : isActive
                      ? 'bg-purple-500/20'
                      : 'bg-white/5'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-purple-400' : 'text-slate-500'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      isActive
                        ? 'text-white'
                        : isDone
                        ? 'text-slate-400'
                        : 'text-slate-600'
                    }`}
                  >
                    {stage.label}
                    {isActive && dots}
                  </p>
                  <AnimatePresence>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-slate-500 mt-0.5"
                      >
                        {stage.detail}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-6 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: `${((currentStage + 1) / stages.length) * 100}%` }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="h-full rounded-full bg-gradient-to-r from-purple-600 via-blue-500 to-cyan-400 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
