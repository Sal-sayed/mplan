// Pure, presentational derivation of the 4-stage journey status (Plan → Set up →
// Go live → Monitor) from the signals already present in ResultsScreen. No JSX, no
// React, no persistence, no schema — ephemeral by design (resets on reload), so it's
// unit-testable with node:test. AppShell consumes { currentStage, statuses }.

import type { Stage, StageStatus } from '@/components/ds/tokens';

export type JourneyView = 'plan' | 'setup' | 'golive' | 'monitor';

// Stage number ↔ the view/handler it corresponds to.
export const VIEW_TO_STAGE: Record<JourneyView, Stage> = { plan: 1, setup: 2, golive: 3, monitor: 4 };

// Which view a journey-nav click maps to — the nav is just a SECOND trigger surface
// for the handlers that already exist in ResultsScreen (plan = back to the hub,
// setup = implementation guide, golive = readiness, monitor = metric health).
export function journeyNavAction(stage: Stage): JourneyView {
  return (['plan', 'setup', 'golive', 'monitor'] as const)[stage - 1];
}

export interface JourneySignals {
  hasPlan: boolean;        // a generated plan exists (Stage 1 reached)
  setupReached: boolean;   // implementation guide built/applied (Stage 2)
  goLive: boolean;         // launch readiness ran / decision === 'go' (Stage 3)
  monitorReached: boolean; // metric health checked / results present (Stage 4)
  view: JourneyView;       // the stage the user is actively viewing
}

// The stage the user is viewing is 'current'; any stage that's been reached is
// 'done'; everything else is 'upcoming'. Statuses are explicit for all 4 stages so a
// jumped-over earlier stage never shows a false 'done'.
export function deriveJourney(s: JourneySignals): { currentStage: Stage; statuses: Partial<Record<number, StageStatus>> } {
  const currentStage = VIEW_TO_STAGE[s.view];
  const reached: Record<Stage, boolean> = {
    1: s.hasPlan,
    2: s.setupReached,
    3: s.goLive,
    4: s.monitorReached,
  };
  const statuses: Partial<Record<number, StageStatus>> = {};
  ([1, 2, 3, 4] as Stage[]).forEach((n) => {
    statuses[n] = n === currentStage ? 'current' : reached[n] ? 'done' : 'upcoming';
  });
  return { currentStage, statuses };
}
