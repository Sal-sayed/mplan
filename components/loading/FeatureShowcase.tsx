'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FEATURE_COLOR_CLASSES,
  getFeaturesForMode,
  shuffleFeatures,
  type LoadingMode,
} from '@/lib/loading-features';

interface Props {
  mode: LoadingMode;
  cardDurationMs?: number;
}

export default function FeatureShowcase({ mode, cardDurationMs = 7000 }: Props) {
  const features = useMemo(() => shuffleFeatures(getFeaturesForMode(mode)), [mode]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIndex(prev => (prev + 1) % features.length);
    }, cardDurationMs);
    return () => clearInterval(t);
  }, [features.length, cardDurationMs, paused]);

  const feature = features[index];
  const Icon = feature.icon;
  const colors = FEATURE_COLOR_CLASSES[feature.color];

  return (
    <div
      className="w-full max-w-xl mx-auto flex flex-col h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex-1 flex items-center justify-center min-h-0">
      <AnimatePresence mode="wait">
        <motion.div
          key={feature.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl border border-ds-line bg-ds-card p-6 shadow-sm"
        >
          <div className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-60 ${colors.glow}`} />

          {feature.highlight && (
            <div className="absolute top-4 right-4">
              <span
                className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wider ${colors.badgeBg} ${colors.badgeText}`}
              >
                {feature.highlight}
              </span>
            </div>
          )}

          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 220, damping: 18 }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colors.iconBg}`}
          >
            <Icon className={`w-6 h-6 ${colors.iconText}`} strokeWidth={1.8} />
          </motion.div>

          <motion.h3
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="text-lg font-semibold text-ds-ink leading-snug mb-2 pr-16"
          >
            {feature.title}
          </motion.h3>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.3 }}
            className="text-sm text-ds-secondary leading-relaxed"
          >
            {feature.description}
          </motion.p>
        </motion.div>
      </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap max-w-md mx-auto">
        {features.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show feature ${i + 1}`}
            className={`h-1.5 rounded-full transition-all pointer-events-auto ${
              i === index
                ? 'w-6 bg-ds-accent'
                : i < index
                ? 'w-1.5 bg-ds-accent/40'
                : 'w-1.5 bg-ds-line-strong'
            }`}
          />
        ))}
      </div>

      <div className="text-center mt-3 text-[11px] text-ds-muted">
        {index + 1} of {features.length}
      </div>
    </div>
  );
}
