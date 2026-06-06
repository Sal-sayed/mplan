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
  running: 'text-blue-400',
  done: 'text-green-400',
  info: 'text-white/40',
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
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-2 h-2 rounded-full bg-red-500"
          />
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">
            Live Activity
          </span>
        </div>
        <span className="text-[10px] text-white/50 font-mono">
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
                <div className={`${entry.type === 'done' ? 'text-white' : 'text-white/70'} leading-snug break-words`}>
                  {entry.message}
                </div>
                {entry.detail && (
                  <div className="text-[10px] text-white/50 mt-0.5 truncate">
                    {entry.detail}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="px-4 py-2 border-t border-white/[0.08] text-[10px] text-white/50">
        Scanner running on {onDeepPage ? 'deep page' : 'homepage'}
      </div>
    </div>
  );
}
