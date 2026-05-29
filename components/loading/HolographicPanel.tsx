'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
  width?: string;
  delay?: number;
  accent?: 'blue' | 'purple' | 'cyan' | 'emerald';
  className?: string;
}

const accentColors = {
  blue: { border: 'rgba(96,165,250,0.25)', glow: 'rgba(96,165,250,0.08)', text: 'text-blue-400', line: '#60a5fa' },
  purple: { border: 'rgba(129,140,248,0.25)', glow: 'rgba(129,140,248,0.08)', text: 'text-indigo-400', line: '#818cf8' },
  cyan: { border: 'rgba(34,211,238,0.25)', glow: 'rgba(34,211,238,0.08)', text: 'text-cyan-400', line: '#22d3ee' },
  emerald: { border: 'rgba(52,211,153,0.25)', glow: 'rgba(52,211,153,0.08)', text: 'text-emerald-400', line: '#34d399' },
};

export default function HolographicPanel({ children, title, width = 'auto', delay = 0, accent = 'blue', className = '' }: Props) {
  const c = accentColors[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative ${className}`}
      style={{ width }}
    >
      {/* Outer glow */}
      <div className="absolute -inset-[1px] rounded-xl blur-sm" style={{ background: c.glow }} />

      {/* Main panel */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'rgba(10,15,30,0.7)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${c.border}`,
          boxShadow: `0 0 30px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        {/* Top scan line */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: `linear-gradient(90deg, transparent, ${c.line}, transparent)` }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l rounded-tl-xl" style={{ borderColor: c.line, opacity: 0.5 }} />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r rounded-tr-xl" style={{ borderColor: c.line, opacity: 0.5 }} />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l rounded-bl-xl" style={{ borderColor: c.line, opacity: 0.3 }} />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r rounded-br-xl" style={{ borderColor: c.line, opacity: 0.3 }} />

        {/* Header */}
        {title && (
          <div className="px-4 py-2 border-b" style={{ borderColor: `${c.border}` }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.line }} />
              <span className={`text-[10px] uppercase tracking-[0.15em] font-medium ${c.text}`}>{title}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {children}
        </div>

        {/* Animated holographic shimmer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, ${c.glow} 50%, transparent 60%)`,
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['-100% 0', '200% 0'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear', delay: delay + 1 }}
        />
      </div>
    </motion.div>
  );
}
