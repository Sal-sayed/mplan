import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveJourney, journeyNavAction, VIEW_TO_STAGE, type JourneySignals } from './journey-stage.ts';

const base: JourneySignals = {
  hasPlan: true,
  setupReached: false,
  goLive: false,
  monitorReached: false,
  view: 'plan',
};

test('plan-only state → Stage 1 current, the rest upcoming', () => {
  const { currentStage, statuses } = deriveJourney(base);
  assert.equal(currentStage, 1);
  assert.deepEqual(statuses, { 1: 'current', 2: 'upcoming', 3: 'upcoming', 4: 'upcoming' });
});

test('setupReached (applyResult/createResult/ga4Result) → Stage 2 marked done', () => {
  const { statuses } = deriveJourney({ ...base, setupReached: true });
  assert.equal(statuses[2], 'done');
});

test('goLive (rdReport.decision === "go") → Stage 3 done', () => {
  const { statuses } = deriveJourney({ ...base, goLive: true });
  assert.equal(statuses[3], 'done');
});

test('metric results present → Stage 4 done', () => {
  const { statuses } = deriveJourney({ ...base, monitorReached: true });
  assert.equal(statuses[4], 'done');
});

test('the actively-viewed stage is current (wins over reached)', () => {
  for (const [view, n] of Object.entries(VIEW_TO_STAGE)) {
    const { currentStage, statuses } = deriveJourney({
      hasPlan: true, setupReached: true, goLive: true, monitorReached: true,
      view: view as JourneySignals['view'],
    });
    assert.equal(currentStage, n, `${view} → currentStage ${n}`);
    assert.equal(statuses[n], 'current', `${view} stage ${n} is current`);
  }
});

test('a not-yet-reached earlier stage never shows a false done when on a later stage', () => {
  // Viewing Go live (3) but setup was never reached → Stage 2 stays upcoming.
  const { statuses } = deriveJourney({ ...base, view: 'golive', setupReached: false, goLive: true });
  assert.equal(statuses[2], 'upcoming');
  assert.equal(statuses[3], 'current');
});

test('journeyNavAction maps each stage to its existing handler/view', () => {
  assert.equal(journeyNavAction(1), 'plan');
  assert.equal(journeyNavAction(2), 'setup');
  assert.equal(journeyNavAction(3), 'golive');
  assert.equal(journeyNavAction(4), 'monitor');
});
