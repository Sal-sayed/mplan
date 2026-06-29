// AppShell — the new app frame for the Plan → Set up → Go live → Monitor journey.
// PURE PRESENTATIONAL: top bar + left journey nav + a "Step N of 4" progress bar +
// the content area. No data fetching, no client hooks — responsive via CSS only (the
// left nav collapses to a compact stage strip on narrow screens).
import type { ComponentType, ReactNode } from 'react';
import { ClipboardList, Settings2, Rocket, Activity, Check, Bell, CircleUser, Plug, History } from 'lucide-react';
import { computeJourneyNav, progressPercent, stepLabel, type NavStage, type Stage, type StageStatus } from './tokens.ts';

const STAGE_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  plan: ClipboardList,
  setup: Settings2,
  golive: Rocket,
  monitor: Activity,
};

function NavItem({ stage, onSelect }: { stage: NavStage; onSelect?: () => void }) {
  const Icon = STAGE_ICON[stage.key];
  const done = stage.status === 'done';
  const current = stage.status === 'current';
  const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
    current ? 'bg-ds-accent-soft font-medium text-ds-accent' : 'text-ds-secondary'
  } ${onSelect ? 'transition hover:bg-ds-panel' : ''}`;
  const inner = (
    <>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-medium ${
          current
            ? 'bg-ds-accent text-ds-accent-ink'
            : done
              ? 'bg-ds-success-soft text-ds-success'
              : 'bg-ds-panel text-ds-muted ring-1 ring-inset ring-ds-line'
        }`}
      >
        {done ? <Check size={14} /> : stage.n}
      </span>
      <span className="flex-1 truncate">{stage.label}</span>
      {Icon ? <Icon size={15} className={current ? 'text-ds-accent' : 'text-ds-muted'} /> : null}
    </>
  );
  // Interactive only when a select handler is supplied (the journey wiring); the
  // /design-preview keeps the plain, non-interactive presentation.
  return onSelect ? (
    <button type="button" onClick={onSelect} className={cls}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

interface AppShellProps {
  currentStage: Stage;
  statuses?: Partial<Record<number, StageStatus>>;
  siteName?: string;
  // Optional: makes the journey nav a trigger surface — clicking a stage calls
  // this with the stage number. Omit it for a purely presentational shell.
  onSelectStage?: (stage: Stage) => void;
  // Optional override for the content area padding (e.g. "p-0" when the children
  // are already full-bleed screens). Defaults to the standard page padding.
  contentClassName?: string;
  children: ReactNode;
}

export function AppShell({ currentStage, statuses, siteName, onSelectStage, contentClassName = 'p-4 sm:p-6', children }: AppShellProps) {
  const nav = computeJourneyNav(currentStage, statuses);
  const pct = progressPercent(currentStage);

  return (
    <div className="flex h-screen w-full flex-col bg-ds-page text-ds-ink">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ds-line bg-ds-card px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ds-accent text-sm font-bold text-ds-accent-ink">S</span>
          <span className="text-sm font-semibold text-ds-ink">Sirah</span>
        </div>
        {siteName ? <span className="hidden truncate text-sm text-ds-secondary sm:inline">· {siteName}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Notifications" className="rounded-lg p-2 text-ds-secondary transition hover:bg-ds-panel">
            <Bell size={17} />
          </button>
          <span className="text-ds-secondary" aria-label="Account">
            <CircleUser size={24} />
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left journey nav — desktop only */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ds-line bg-ds-card p-3 md:flex">
          <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-ds-muted">Your journey</p>
          <nav className="space-y-0.5">
            {nav.map((s) => (
              <NavItem key={s.key} stage={s} onSelect={onSelectStage ? () => onSelectStage(s.n) : undefined} />
            ))}
          </nav>
          <div className="my-3 border-t border-ds-line" />
          <nav className="space-y-0.5">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ds-secondary">
              <Plug size={15} className="text-ds-muted" /> Connections
            </div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ds-secondary">
              <History size={15} className="text-ds-muted" /> History
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Progress header */}
          <div className="shrink-0 border-b border-ds-line bg-ds-card px-4 py-3 sm:px-6">
            {/* compact stage strip — mobile only */}
            <div className="mb-2 flex gap-1.5 md:hidden">
              {nav.map((s) => {
                const barCls = `h-1.5 flex-1 rounded-full ${s.current ? 'bg-ds-accent' : s.status === 'done' ? 'bg-ds-success' : 'bg-ds-line-strong'}`;
                return onSelectStage ? (
                  <button key={s.key} type="button" aria-label={s.label} onClick={() => onSelectStage(s.n)} className={barCls} />
                ) : (
                  <span key={s.key} className={barCls} />
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ds-secondary">{stepLabel(currentStage)}</span>
              <span className="text-xs text-ds-muted">{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ds-line">
              <div className="h-full rounded-full bg-ds-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Content */}
          <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
