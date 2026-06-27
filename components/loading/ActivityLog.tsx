'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ActivityEntry {
  id: string;
  type: 'running' | 'done' | 'info';
  message: string;
  detail?: string;
  timestamp: number;
}

interface Props {
  entries: ActivityEntry[];
  maxVisible?: number;
}

const STATUS_ICON: Record<ActivityEntry['type'], string> = {
  running: '→',
  done: '✓',
  info: '·',
};

const STATUS_COLOR: Record<ActivityEntry['type'], string> = {
  running: 'text-ds-accent',
  done: 'text-emerald-600',
  info: 'text-ds-muted',
};

export default function ActivityLog({ entries, maxVisible = 24 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const visible = entries.slice(-maxVisible);
  const last = entries[entries.length - 1];
  const onDeepPage = !!last?.detail?.startsWith('/');

  return (
    <div className="bg-ds-card border border-ds-line rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-ds-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-2 h-2 rounded-full bg-red-500"
          />
          <span className="text-[10px] uppercase tracking-[0.15em] text-ds-secondary font-medium">
            Live Activity
          </span>
        </div>
        <span className="text-[10px] text-ds-muted font-mono">
          {entries.length} events
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs no-scrollbar">
        <AnimatePresence initial={false}>
          {visible.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="py-1 flex items-start gap-2"
            >
              <span className={`${STATUS_COLOR[entry.type]} flex-shrink-0 mt-px font-bold`}>
                {STATUS_ICON[entry.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`${entry.type === 'done' ? 'text-ds-ink' : 'text-ds-secondary'} leading-snug break-words`}>
                  {entry.message}
                </div>
                {entry.detail && (
                  <div className="text-[10px] text-ds-muted mt-0.5 truncate">
                    {entry.detail}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="px-4 py-2 border-t border-ds-line text-[10px] text-ds-muted">
        Scanner running on {onDeepPage ? 'deep page' : 'homepage'}
      </div>
    </div>
  );
}
