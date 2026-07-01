// ds/tokens.ts — the PURE, presentational logic + token-driven class maps behind the
// new design system. No JSX, no React, no business logic — so it's unit-testable with
// node:test (the .tsx components import these). All colors come from the namespaced
// `ds-*` Tailwind utilities (see app/globals.css), never from the existing app tokens.

export type Stage = 1 | 2 | 3 | 4;
export type StageStatus = 'done' | 'current' | 'upcoming';

// The 4-stage customer journey.
export const STAGES: ReadonlyArray<{ n: Stage; key: string; label: string }> = [
  { n: 1, key: 'plan', label: 'Plan' },
  { n: 2, key: 'setup', label: 'Set up' },
  { n: 3, key: 'golive', label: 'Go live' },
  { n: 4, key: 'monitor', label: 'Monitor' },
];

export interface NavStage {
  n: Stage;
  key: string;
  label: string;
  status: StageStatus;
  current: boolean;
}

// Resolve each stage's status. An explicit per-stage status wins; otherwise it's
// derived from the current stage (earlier = done, equal = current, later = upcoming).
export function computeJourneyNav(current: Stage, statuses?: Partial<Record<number, StageStatus>>): NavStage[] {
  return STAGES.map((s) => {
    const status: StageStatus = statuses?.[s.n] ?? (s.n < current ? 'done' : s.n === current ? 'current' : 'upcoming');
    return { n: s.n, key: s.key, label: s.label, status, current: s.n === current };
  });
}

export function progressPercent(current: Stage): number {
  return Math.round((current / STAGES.length) * 100);
}

export function stepLabel(current: Stage): string {
  return `Step ${current} of ${STAGES.length}`;
}

// ── variant → class maps (token-driven) ──

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

const BADGE_BASE = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';
// Verdict pills on LIGHT cards: soft tinted bg + the readable -text shade.
const BADGE_VARIANT: Record<BadgeVariant, string> = {
  success: 'bg-ds-success-soft text-ds-success-text ring-ds-success/15',
  warning: 'bg-ds-warning-soft text-ds-warning-text ring-ds-warning/20',
  danger: 'bg-ds-danger-soft text-ds-danger-text ring-ds-danger/15',
  neutral: 'bg-ds-neutral-soft text-ds-secondary ring-ds-line-strong',
};
export function badgeClasses(variant: BadgeVariant): string {
  return `${BADGE_BASE} ${BADGE_VARIANT[variant]}`;
}

export type Verdict = 'success' | 'warning' | 'danger';

const VERDICT_VARIANT: Record<Verdict, { container: string; accent: string }> = {
  success: { container: 'bg-ds-success-soft border-ds-success/25', accent: 'text-ds-success-text' },
  warning: { container: 'bg-ds-warning-soft border-ds-warning/25', accent: 'text-ds-warning-text' },
  danger: { container: 'bg-ds-danger-soft border-ds-danger/30', accent: 'text-ds-danger-text' },
};
export function verdictClasses(variant: Verdict): { container: string; accent: string } {
  return VERDICT_VARIANT[variant];
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 disabled:opacity-50 disabled:cursor-not-allowed';
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // The ONE primary action per screen — solid green accent.
  primary: 'bg-ds-accent text-ds-accent-ink hover:bg-ds-accent-hover shadow-sm',
  // A quiet, soft-green secondary CTA.
  secondary: 'bg-ds-accent-soft text-ds-accent-text ring-1 ring-inset ring-ds-accent/20 hover:bg-ds-success-soft',
  // A neutral outline (toolbars, "All metrics ▾").
  ghost: 'bg-ds-panel text-ds-secondary ring-1 ring-inset ring-ds-line-strong hover:bg-ds-subtle',
};
export function buttonClasses(variant: ButtonVariant): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]}`;
}
