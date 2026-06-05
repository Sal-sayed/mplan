'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowLeft } from 'lucide-react';
import SpeedCoder from './loading/SpeedCoder';
import WhackABugGame from './loading/WhackABugGame';

const STAGES = [
  { key: 'scraping', label: 'Scanning website', desc: 'Reading buttons, forms, and CTAs' },
  { key: 'scoring', label: 'Auditing tracking', desc: 'Detecting GA4, GTM, and pixels' },
  { key: 'generating', label: 'Generating plan', desc: 'Writing events, KPIs, and dimensions' },
  { key: 'delivering', label: 'Delivering to inbox', desc: 'Building Excel and sending email' },
];

// Checkpoint progress each stage starts at (matches setProgress(...) calls in runPipeline)
const STAGE_CHECKPOINTS: Record<string, number> = {
  scraping: 15,
  scoring: 30,
  generating: 65,
  delivering: 85,
};

// Heuristic expected duration per stage, in ms. Used to drive smooth creep — does
// not affect actual work; only the visual bar. Existing-mode scrape is much heavier
// (network interception, dataLayer extraction, GTM container fetch, sub-pages).
function getExpectedDurationMs(stage: string, mode?: 'new' | 'audit'): number {
  switch (stage) {
    // Existing-mode scrape: 45s sim on homepage + 25s sim × up to 3 sub-pages
    // + consent/navigation/settle/GTM-fetch overhead → ~3-4 minutes.
    case 'scraping': return mode === 'audit' ? 420000 : 25000;
    case 'scoring': return 8000;
    case 'generating': return 60000;
    case 'delivering': return 6000;
    default: return 10000;
  }
}

function nextCheckpoint(stage: string): number {
  const idx = STAGES.findIndex(s => s.key === stage);
  if (idx < 0) return 100;
  const next = STAGES[idx + 1];
  return next ? STAGE_CHECKPOINTS[next.key] : 100;
}

interface StreamMilestone {
  emoji: string;
  message: string;
  progress: number;
  timestamp: number;
}

interface Props {
  stage: string;
  progress: number;
  url: string;
  email: string;
  mode?: 'new' | 'audit';
  onCancel?: () => void;
  // Live streaming updates from /api/generate-plan and /api/generate-audit.
  // Only populated during the `generating` stage; we render the current
  // milestone over the stage list so the wait feels active.
  streamCurrentEmoji?: string;
  streamCurrentMessage?: string;
  streamMilestones?: StreamMilestone[];
}

export default function LoadingScreen({
  stage,
  progress,
  url,
  email,
  mode,
  onCancel,
  streamCurrentEmoji,
  streamCurrentMessage,
  streamMilestones,
}: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === stage);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startTime = useRef<number>(Date.now());

  // Smooth, asymptotic creep — display progress edges toward the next checkpoint
  // over the stage's expected duration so the bar always appears to be moving.
  const [displayProgress, setDisplayProgress] = useState(progress);
  const stageEnteredAt = useRef<number>(Date.now());
  const stageEntryProgress = useRef<number>(progress);
  const lastStage = useRef<string>(stage);
  const lastTargetProgress = useRef<number>(progress);

  // Reset stage anchors when the real stage or backend checkpoint changes
  useEffect(() => {
    if (stage !== lastStage.current || progress !== lastTargetProgress.current) {
      stageEnteredAt.current = Date.now();
      stageEntryProgress.current = Math.max(progress, displayProgress);
      lastStage.current = stage;
      lastTargetProgress.current = progress;
    }
    // displayProgress intentionally excluded — we only re-anchor on real stage/checkpoint changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, progress]);

  useEffect(() => {
    const i = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000));

      const expected = getExpectedDurationMs(stage, mode);
      const elapsedInStage = Date.now() - stageEnteredAt.current;
      const ceiling = Math.max(nextCheckpoint(stage) - 0.5, progress);
      const start = stageEntryProgress.current;
      // 1 - exp(-t / expected) gives a curve that approaches 1 but never reaches it,
      // so the bar feels alive without lying about completion.
      const k = 1 - Math.exp(-elapsedInStage / (expected * 0.7));
      const target = start + (ceiling - start) * k;
      // Never go backwards, never overtake the next checkpoint, always >= real progress
      setDisplayProgress(prev => Math.max(prev, Math.min(target, ceiling), progress));
    }, 200);
    return () => clearInterval(i);
  }, [stage, mode, progress]);

  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-hidden relative">

      {/* Back button */}
      {onCancel && (
        <button onClick={onCancel}
          className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-white transition text-sm z-20 pointer-events-auto">
          <ArrowLeft size={14} /> Back
        </button>
      )}

      {/* Interactive whack-a-bug game layer */}
      <WhackABugGame />

      {/* Main content — pointer-events-none so bugs behind are clickable */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full pointer-events-none">

        {/* URL and Email */}
        <div className="mb-6 text-center">
          <p className="text-white text-sm font-medium truncate max-w-md">{url}</p>
          <p className="text-white/70 text-xs mt-1 truncate max-w-md">&rarr; {email}</p>
        </div>

        {/* Speed Coder — the star of the show */}
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
          <div className="relative">
            <SpeedCoder />
          </div>
        </div>

        {/* Streaming milestone — live update from Claude as it generates */}
        {stage === 'generating' && streamCurrentMessage && (
          <div className="w-full max-w-md mt-6 flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <motion.span
              key={streamCurrentEmoji || 'pulse'}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: 'backOut' }}
              className="text-2xl"
            >
              {streamCurrentEmoji || '✨'}
            </motion.span>
            <div className="min-w-0">
              <div className="text-white text-sm font-medium truncate">{streamCurrentMessage}</div>
              {streamMilestones && streamMilestones.length > 1 && (
                <div className="text-white/50 text-[10px] mt-0.5">
                  Step {streamMilestones.length} · live
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stage progress list */}
        <div className="w-full max-w-md mt-6 space-y-3">
          {STAGES.map((s, idx) => {
            const isActive = s.key === stage;
            const isDone = currentIdx > idx;
            return (
              <div key={s.key} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isDone ? (
                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </div>
                  ) : isActive ? (
                    <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-white/30" />
                  )}
                </div>
                <div>
                  <div className={
                    isActive ? 'text-white font-medium text-sm'
                    : isDone ? 'text-emerald-400 text-sm'
                    : 'text-white/40 text-sm'
                  }>
                    {s.label}
                  </div>
                  <div className="text-white/60 text-xs">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-md mt-6">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-400 relative"
              initial={{ width: 0 }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ duration: 0.4, ease: 'linear' }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
            </motion.div>
          </div>
          <div className="flex items-center justify-between text-xs text-white/50 mt-1.5">
            <span>{Math.round(displayProgress)}%</span>
            <span className="font-mono">{timeDisplay}</span>
          </div>
        </div>

      </div>{/* end pointer-events-none wrapper */}
    </div>
  );
}
