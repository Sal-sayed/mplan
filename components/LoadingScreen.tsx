'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import FeatureShowcase from './loading/FeatureShowcase';
import ActivityLog, { type ActivityEntry } from './loading/ActivityLog';
import StatsDashboard, { type LiveStats } from './loading/StatsDashboard';

const STAGES = [
  { key: 'scraping',   label: 'Scanning website',   desc: 'Reading buttons, forms, and CTAs' },
  { key: 'scoring',    label: 'Auditing tracking',  desc: 'Detecting GA4, GTM, and pixels' },
  { key: 'generating', label: 'Generating plan',    desc: 'Writing events, KPIs, and dimensions' },
  { key: 'delivering', label: 'Delivering to inbox', desc: 'Building Excel and sending email' },
];

const STAGE_CHECKPOINTS: Record<string, number> = {
  scraping: 15,
  scoring: 30,
  generating: 65,
  delivering: 85,
};

function getExpectedDurationMs(stage: string, mode?: 'new' | 'audit'): number {
  switch (stage) {
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

// Sum of remaining stages' expected durations — used to compute ETA.
function remainingExpectedMs(stage: string, mode?: 'new' | 'audit', elapsedInStageMs = 0): number {
  const idx = STAGES.findIndex(s => s.key === stage);
  if (idx < 0) return 0;
  const currentRemaining = Math.max(0, getExpectedDurationMs(stage, mode) - elapsedInStageMs);
  let rest = 0;
  for (let i = idx + 1; i < STAGES.length; i++) {
    rest += getExpectedDurationMs(STAGES[i].key, mode);
  }
  return currentRemaining + rest;
}

// ─── ACTIVITY SCRIPTS ─────────────────────────────────────────
type ScriptEntry = { delayMs: number; entry: Omit<ActivityEntry, 'id' | 'timestamp'> };

const AUDIT_ACTIVITY: ScriptEntry[] = [
  { delayMs: 500,    entry: { type: 'running', message: 'Launching headless browser' } },
  { delayMs: 1500,   entry: { type: 'done',    message: 'Browser ready' } },
  { delayMs: 2000,   entry: { type: 'running', message: 'Visiting homepage' } },
  { delayMs: 4500,   entry: { type: 'done',    message: 'Page loaded successfully' } },
  { delayMs: 5500,   entry: { type: 'running', message: 'Accepting consent banner' } },
  { delayMs: 7500,   entry: { type: 'done',    message: 'Consent accepted' } },
  { delayMs: 8500,   entry: { type: 'running', message: 'Extracting measurement IDs' } },
  { delayMs: 10500,  entry: { type: 'done',    message: 'Detected GA4 property' } },
  { delayMs: 11500,  entry: { type: 'done',    message: 'Detected GTM container' } },
  { delayMs: 12500,  entry: { type: 'done',    message: 'Detected second GTM container' } },
  { delayMs: 13500,  entry: { type: 'done',    message: 'Detected Meta Pixel' } },
  { delayMs: 15000,  entry: { type: 'running', message: 'Parsing GTM containers' } },
  { delayMs: 17000,  entry: { type: 'done',    message: 'Configured events extracted' } },
  { delayMs: 18000,  entry: { type: 'running', message: 'Capturing live events' } },
  { delayMs: 20000,  entry: { type: 'done',    message: 'Captured page_view (GA4)' } },
  { delayMs: 21000,  entry: { type: 'done',    message: 'Captured user_engagement (GA4)' } },
  { delayMs: 22500,  entry: { type: 'done',    message: 'Captured PageView (Meta Pixel)' } },
  { delayMs: 24000,  entry: { type: 'running', message: 'Simulating user interactions' } },
  { delayMs: 27000,  entry: { type: 'done',    message: 'Captured add_to_cart equivalent' } },
  { delayMs: 28500,  entry: { type: 'done',    message: 'Captured view_more_details' } },
  { delayMs: 30000,  entry: { type: 'info',    message: 'Discovering deep pages' } },
  { delayMs: 32000,  entry: { type: 'done',    message: 'Found product page',  detail: '/products' } },
  { delayMs: 33000,  entry: { type: 'done',    message: 'Found category page', detail: '/collections' } },
  { delayMs: 35000,  entry: { type: 'running', message: 'Scanning product page' } },
  { delayMs: 40000,  entry: { type: 'done',    message: 'view_item fired on product page' } },
  { delayMs: 42000,  entry: { type: 'running', message: 'Scanning category page' } },
  { delayMs: 46000,  entry: { type: 'done',    message: 'view_item_list fired' } },
  { delayMs: 50000,  entry: { type: 'running', message: 'Detecting business model' } },
  { delayMs: 53000,  entry: { type: 'done',    message: 'Business model classified' } },
  { delayMs: 75000,  entry: { type: 'info',    message: 'Analyzing gaps with AI' } },
  { delayMs: 130000, entry: { type: 'running', message: 'Building Excel workbook' } },
  { delayMs: 150000, entry: { type: 'done',    message: 'Excel ready' } },
];

const NEW_ACTIVITY: ScriptEntry[] = [
  { delayMs: 500,    entry: { type: 'running', message: 'Launching browser' } },
  { delayMs: 1500,   entry: { type: 'done',    message: 'Browser ready' } },
  { delayMs: 2000,   entry: { type: 'running', message: 'Visiting your site' } },
  { delayMs: 5000,   entry: { type: 'done',    message: 'Page loaded' } },
  { delayMs: 6000,   entry: { type: 'running', message: 'Analyzing site structure' } },
  { delayMs: 9000,   entry: { type: 'done',    message: 'Industry detected' } },
  { delayMs: 10500,  entry: { type: 'done',    message: 'Business model classified' } },
  { delayMs: 12000,  entry: { type: 'running', message: 'Extracting content insights' } },
  { delayMs: 15000,  entry: { type: 'done',    message: 'Identified product categories' } },
  { delayMs: 17000,  entry: { type: 'running', message: 'AI generating measurement plan' } },
  { delayMs: 25000,  entry: { type: 'done',    message: 'Business objectives defined' } },
  { delayMs: 30000,  entry: { type: 'done',    message: 'KPIs mapped to objectives' } },
  { delayMs: 40000,  entry: { type: 'done',    message: 'User journey flows created' } },
  { delayMs: 55000,  entry: { type: 'done',    message: 'GA4 events configured' } },
  { delayMs: 70000,  entry: { type: 'done',    message: 'Custom dimensions added' } },
  { delayMs: 85000,  entry: { type: 'done',    message: 'Conversion goals defined' } },
  { delayMs: 100000, entry: { type: 'done',    message: 'Implementation roadmap built' } },
  { delayMs: 110000, entry: { type: 'running', message: 'Generating dataLayer schema' } },
  { delayMs: 120000, entry: { type: 'done',    message: 'GTM configuration ready' } },
  { delayMs: 130000, entry: { type: 'running', message: 'Building Excel workbook' } },
  { delayMs: 145000, entry: { type: 'done',    message: 'Excel ready' } },
];

const AUDIT_STATS: Array<{ delayMs: number; stats: LiveStats }> = [
  { delayMs: 11000, stats: { gtmContainers: 1, toolsActive: 1 } },
  { delayMs: 12500, stats: { gtmContainers: 2, toolsActive: 2 } },
  { delayMs: 13500, stats: { gtmContainers: 2, toolsActive: 3 } },
  { delayMs: 17000, stats: { gtmContainers: 2, toolsActive: 3, eventsFound: 11 } },
  { delayMs: 22500, stats: { gtmContainers: 2, toolsActive: 4, eventsFound: 14, pagesScanned: 1 } },
  { delayMs: 30000, stats: { gtmContainers: 2, toolsActive: 4, eventsFound: 17, pagesScanned: 1 } },
  { delayMs: 40000, stats: { gtmContainers: 2, toolsActive: 4, eventsFound: 22, pagesScanned: 2 } },
  { delayMs: 46000, stats: { gtmContainers: 2, toolsActive: 4, eventsFound: 25, pagesScanned: 3 } },
  { delayMs: 53000, stats: { gtmContainers: 2, toolsActive: 4, eventsFound: 27, pagesScanned: 4 } },
];

const NEW_STATS: Array<{ delayMs: number; stats: LiveStats }> = [
  { delayMs: 9000,  stats: { objectives: 1 } },
  { delayMs: 25000, stats: { objectives: 5, kpis: 4 } },
  { delayMs: 30000, stats: { objectives: 5, kpis: 12 } },
  { delayMs: 40000, stats: { objectives: 5, kpis: 12, events: 8 } },
  { delayMs: 55000, stats: { objectives: 5, kpis: 12, events: 22 } },
  { delayMs: 70000, stats: { objectives: 5, kpis: 12, events: 22, dimensions: 10 } },
];

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
  streamCurrentMessage,
  streamMilestones,
}: Props) {
  const effectiveMode: 'new' | 'audit' = mode ?? 'new';
  const currentIdx = STAGES.findIndex(s => s.key === stage);

  // ── Smooth-creep progress (carried over from the previous LoadingScreen) ──
  const [displayProgress, setDisplayProgress] = useState(progress);
  const stageEnteredAt = useRef<number>(Date.now());
  const stageEntryProgress = useRef<number>(progress);
  const lastStage = useRef<string>(stage);
  const lastTargetProgress = useRef<number>(progress);

  useEffect(() => {
    if (stage !== lastStage.current || progress !== lastTargetProgress.current) {
      stageEnteredAt.current = Date.now();
      stageEntryProgress.current = Math.max(progress, displayProgress);
      lastStage.current = stage;
      lastTargetProgress.current = progress;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, progress]);

  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const i = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));

      const expected = getExpectedDurationMs(stage, effectiveMode);
      const elapsedInStage = Date.now() - stageEnteredAt.current;
      const ceiling = Math.max(nextCheckpoint(stage) - 0.5, progress);
      const start = stageEntryProgress.current;
      const k = 1 - Math.exp(-elapsedInStage / (expected * 0.7));
      const target = start + (ceiling - start) * k;
      setDisplayProgress(prev => Math.max(prev, Math.min(target, ceiling), progress));
    }, 200);
    return () => clearInterval(i);
  }, [stage, effectiveMode, progress]);

  // ── ETA: sum remaining expected time across stages ──
  const elapsedInStageMs = elapsed * 1000 - (stageEnteredAt.current - startRef.current);
  const etaSeconds = Math.floor(
    remainingExpectedMs(stage, effectiveMode, Math.max(0, elapsedInStageMs)) / 1000
  );

  // ── Activity log: scripted entries + live streaming milestones ──
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const sessionId = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const seenMilestoneRefs = useRef<Set<number>>(new Set());

  useEffect(() => {
    const script = effectiveMode === 'audit' ? AUDIT_ACTIVITY : NEW_ACTIVITY;
    const timers = script.map((item, idx) =>
      setTimeout(() => {
        setActivities(prev => [
          ...prev,
          { ...item.entry, id: `scripted-${sessionId}-${idx}`, timestamp: Date.now() },
        ]);
      }, item.delayMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [effectiveMode, sessionId]);

  // Bridge real Claude streaming milestones into the activity log
  useEffect(() => {
    if (!streamMilestones || streamMilestones.length === 0) return;
    streamMilestones.forEach(m => {
      if (seenMilestoneRefs.current.has(m.timestamp)) return;
      seenMilestoneRefs.current.add(m.timestamp);
      setActivities(prev => [
        ...prev,
        {
          id: `stream-${m.timestamp}`,
          type: 'done',
          message: m.message,
          timestamp: m.timestamp,
        },
      ]);
    });
  }, [streamMilestones]);

  // ── Stats: scripted progression ──
  const [stats, setStats] = useState<LiveStats>({});
  useEffect(() => {
    const script = effectiveMode === 'audit' ? AUDIT_STATS : NEW_STATS;
    const timers = script.map(item =>
      setTimeout(() => {
        setStats(prev => ({ ...prev, ...item.stats }));
      }, item.delayMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [effectiveMode]);

  // ── Header status text ──
  const statusText =
    stage === 'generating' && streamCurrentMessage
      ? streamCurrentMessage
      : STAGES.find(s => s.key === stage)?.label ??
        (effectiveMode === 'audit' ? 'Auditing your site' : 'Building your plan');

  const hostname = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  const formatTime = (s: number) => {
    if (s <= 0) return '0s';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const elapsedDisplay = formatTime(elapsed);

  return (
    <div className="h-full w-full flex flex-col p-4 md:p-6 overflow-hidden relative bg-ds-page">

      {/* Ambient glow */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-ds-accent/5 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-ds-accent/5 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1.5s' }}
        />
      </div>

      {/* Back button */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2 text-ds-secondary hover:text-ds-ink transition text-sm z-20"
        >
          <ArrowLeft size={14} /> Back
        </button>
      )}

      {/* ═══ TOP: STATUS BAR ═══ */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center justify-center flex-wrap gap-3 pl-16 md:pl-20 pr-2"
      >
        <div className="flex items-center gap-3 px-4 py-1.5 bg-ds-card border border-ds-line rounded-full shadow-sm">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="w-3 h-3 rounded-full border-2 border-ds-accent border-t-transparent"
          />
          <span className="text-xs text-ds-ink">
            {statusText}
            <span className="text-ds-muted"> · {hostname}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1 bg-ds-card border border-ds-line rounded-full text-ds-secondary font-mono">
            {Math.round(displayProgress)}%
          </span>
          <span className="px-2.5 py-1 bg-ds-card border border-ds-line rounded-full text-ds-secondary font-mono">
            {elapsedDisplay}
          </span>
        </div>
      </motion.div>

      {/* Email line (small, under top bar) */}
      <div className="text-center text-[11px] text-ds-muted mb-3 truncate">
        → {email}
      </div>

      {/* ═══ MAIN: 3 COLUMNS ═══ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1.1fr_1fr] gap-3 md:gap-4 min-h-0">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="min-h-[280px] lg:min-h-0"
        >
          <ActivityLog entries={activities} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-ds-card border border-ds-line rounded-xl shadow-sm flex flex-col overflow-hidden min-h-[360px] lg:min-h-0"
        >
          <div className="px-4 py-3 border-b border-ds-line">
            <div className="text-[10px] uppercase tracking-[0.15em] text-ds-muted font-medium">
              What you’re getting
            </div>
          </div>
          <div className="flex-1 p-4 md:p-6 min-h-0">
            <FeatureShowcase mode={effectiveMode} cardDurationMs={7000} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="min-h-[280px] lg:min-h-0"
        >
          <StatsDashboard stats={stats} mode={effectiveMode} />
        </motion.div>
      </div>

      {/* ═══ BOTTOM: STAGE PROGRESS + BAR + ETA ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-4"
      >
        <div className="flex items-center gap-3 mb-2 overflow-x-auto no-scrollbar">
          {STAGES.map((s, idx) => {
            const isActive = s.key === stage;
            const isDone = currentIdx > idx;
            return (
              <div
                key={s.key}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border ${
                  isActive
                    ? 'border-ds-accent/40 bg-ds-accent-soft text-ds-accent'
                    : isDone
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                    : 'border-ds-line text-ds-muted'
                }`}
              >
                <span>{isDone ? '✓' : isActive ? '●' : '○'}</span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 bg-overlay rounded-full overflow-hidden border border-line">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 relative"
                initial={{ width: 0 }}
                animate={{ width: `${displayProgress}%` }}
                transition={{ duration: 0.4, ease: 'linear' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
              </motion.div>
            </div>
          </div>
          <div className="text-[11px] text-faint font-mono whitespace-nowrap">
            {etaSeconds > 1 ? `~${formatTime(etaSeconds)} remaining` : 'Almost there…'}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
