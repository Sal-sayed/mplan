// AppShell — the dark app shell for the Plan → Set up → Go live → Monitor journey,
// per the Monitor design target: a dark left rail (logo, workspace switcher, search,
// journey icon-nav with a green active pill, secondary links, user block pinned to
// the bottom) and a scrolling content area on the dark shell where light cards float.
// PURE PRESENTATIONAL. The journey computation (computeJourneyNav) is untouched.
import type { ReactNode } from 'react';
import { Search, ChevronDown, Settings, HelpCircle, MoreHorizontal, Check } from 'lucide-react';
import { computeJourneyNav, type NavStage, type Stage, type StageStatus } from './tokens.ts';

function hostOf(u: string): string {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'A';
}

// The three-bar brand mark + wordmark (green, on the dark shell).
function LogoMark() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 pb-4 pt-1">
      <span className="flex h-[22px] items-end gap-[2.5px]" aria-hidden>
        <span className="block h-3 w-1 rounded-sm bg-ds-accent-bright" />
        <span className="block h-[18px] w-1 rounded-sm bg-ds-accent-bright" />
        <span className="block h-[22px] w-1 rounded-sm bg-ds-accent-bright" />
      </span>
      <span className="text-base font-extrabold tracking-tight text-ds-shell-ink">Sirah</span>
    </div>
  );
}

// A journey step row: number/check badge, label, and a green active-pill dot.
function NavItem({ stage, onSelect }: { stage: NavStage; onSelect?: () => void }) {
  const done = stage.status === 'done';
  const current = stage.status === 'current';
  const badge = current
    ? 'bg-ds-accent text-ds-accent-ink'
    : done
      ? 'bg-ds-shell-raised text-ds-accent-bright ring-1 ring-inset ring-ds-accent/25'
      : 'bg-ds-shell-inset text-ds-shell-muted ring-1 ring-inset ring-ds-shell-line';
  const label = current ? 'font-bold text-ds-shell-ink' : done ? 'font-semibold text-ds-shell-secondary' : 'font-medium text-ds-shell-muted';
  const row = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${onSelect ? 'transition hover:bg-white/[0.04]' : ''}`;
  const inner = (
    <>
      <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold ${badge}`}>
        {done ? <Check size={14} /> : stage.n}
      </span>
      <span className={`flex-1 truncate text-[13.5px] ${label}`}>{stage.label}</span>
      {current ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ds-accent-bright shadow-[0_0_0_4px_rgba(52,211,153,0.16)]" aria-hidden /> : null}
    </>
  );
  return onSelect ? (
    <button type="button" onClick={onSelect} className={row}>{inner}</button>
  ) : (
    <div className={row}>{inner}</div>
  );
}

interface AppShellProps {
  currentStage: Stage;
  statuses?: Partial<Record<number, StageStatus>>;
  siteName?: string;
  // Optional: makes the journey nav a trigger surface. Omit for a static shell.
  onSelectStage?: (stage: Stage) => void;
  // Optional user shown in the bottom block.
  user?: { name?: string; role?: string };
  // Content-area padding override (e.g. "p-0" for full-bleed screens).
  contentClassName?: string;
  children: ReactNode;
}

export function AppShell({ currentStage, statuses, siteName, onSelectStage, user, contentClassName = 'p-6', children }: AppShellProps) {
  const nav = computeJourneyNav(currentStage, statuses);
  const workspace = siteName ? hostOf(siteName) : 'Workspace';
  const wsInitial = (workspace[0] || 'S').toUpperCase();
  const userName = user?.name ?? 'Account';
  const userRole = user?.role ?? 'Signed in';

  return (
    <div className="flex h-screen w-full bg-ds-page text-ds-ink">
      {/* ── Left rail (desktop) — the one dark surface ── */}
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-ds-shell-line bg-ds-shell-panel p-4 text-ds-shell-ink lg:flex">
        <LogoMark />

        {/* workspace switcher */}
        <button type="button" className="flex w-full items-center gap-2.5 rounded-xl bg-ds-shell-raised px-2.5 py-2 text-left ring-1 ring-inset ring-ds-shell-line transition hover:bg-white/[0.03]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-ds-accent text-[13px] font-bold text-ds-accent-ink">{wsInitial}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold text-ds-shell-muted">WORKSPACE</span>
            <span className="block truncate text-[13px] font-bold text-ds-shell-ink">{workspace}</span>
          </span>
          <ChevronDown size={13} className="shrink-0 text-ds-shell-muted" />
        </button>

        {/* search */}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-ds-shell-inset px-2.5 py-2 ring-1 ring-inset ring-ds-shell-line">
          <Search size={13} className="text-ds-shell-faint" />
          <span className="flex-1 text-xs text-ds-shell-faint">Search…</span>
          <span className="rounded border border-ds-shell-line px-1.5 text-[10px] text-ds-shell-faint">⌘F</span>
        </div>

        {/* journey */}
        <div className="mt-6 px-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-ds-shell-faint">Setup journey</div>
        <nav className="mt-3 space-y-0.5">
          {nav.map((s) => (
            <NavItem key={s.key} stage={s} onSelect={onSelectStage ? () => onSelectStage(s.n) : undefined} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* secondary */}
        <div className="flex flex-col gap-0.5 px-0.5 pb-2.5">
          <button type="button" className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-ds-shell-muted transition hover:bg-white/[0.04]"><Settings size={15} /> Settings</button>
          <button type="button" className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-ds-shell-muted transition hover:bg-white/[0.04]"><HelpCircle size={15} /> Help &amp; docs</button>
        </div>

        {/* user */}
        <div className="flex items-center gap-2.5 border-t border-ds-shell-line pt-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2b7a5b] to-[#134e37] text-[13px] font-bold text-[#eafaf2]">{initialsOf(userName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ds-shell-ink">{userName}</span>
            <span className="block truncate text-[11px] text-ds-shell-faint">{userRole}</span>
          </span>
          <MoreHorizontal size={14} className="shrink-0 text-ds-shell-muted" />
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar — rail collapses to a logo + stage strip */}
        <div className="flex shrink-0 items-center gap-3 border-b border-ds-shell-line bg-ds-shell-panel px-4 py-2.5 lg:hidden">
          <LogoMark />
          <div className="ml-auto flex items-center gap-1.5">
            {nav.map((s) => {
              const b = s.current ? 'bg-ds-accent text-ds-accent-ink' : s.status === 'done' ? 'bg-ds-shell-raised text-ds-accent-bright' : 'bg-ds-shell-inset text-ds-shell-muted';
              const cls = `flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${b}`;
              return onSelectStage ? (
                <button key={s.key} type="button" aria-label={s.label} onClick={() => onSelectStage(s.n)} className={cls}>{s.status === 'done' ? <Check size={12} /> : s.n}</button>
              ) : (
                <span key={s.key} className={cls}>{s.status === 'done' ? <Check size={12} /> : s.n}</span>
              );
            })}
          </div>
        </div>

        {/* content — dark shell; light cards float here */}
        <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}
