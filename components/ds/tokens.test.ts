// Design-system logic tests (pure — the .tsx components are presentational and render
// these classes/props). Covers the journey-nav computation + the variant class maps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES,
  computeJourneyNav,
  progressPercent,
  stepLabel,
  badgeClasses,
  verdictClasses,
  buttonClasses,
} from './tokens.ts';

test('the journey has the 4 stages in order', () => {
  assert.deepEqual(STAGES.map((s) => s.label), ['Plan', 'Set up', 'Go live', 'Monitor']);
});

test('computeJourneyNav: earlier=done, equal=current (highlighted), later=upcoming', () => {
  const nav = computeJourneyNav(2);
  assert.equal(nav.length, 4);
  assert.deepEqual(nav.map((s) => s.status), ['done', 'current', 'upcoming', 'upcoming']);
  assert.deepEqual(nav.map((s) => s.current), [false, true, false, false]);
});

test('computeJourneyNav: an explicit per-stage status wins over the derived one', () => {
  const nav = computeJourneyNav(3, { 1: 'current', 4: 'done' });
  assert.equal(nav[0].status, 'current'); // overridden
  assert.equal(nav[2].status, 'current'); // stage 3 = the current stage
  assert.equal(nav[2].current, true);
  assert.equal(nav[3].status, 'done'); // overridden (would otherwise be upcoming)
});

test('progressPercent + stepLabel', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => progressPercent(n as 1 | 2 | 3 | 4)), [25, 50, 75, 100]);
  assert.equal(stepLabel(3), 'Step 3 of 4');
});

test('badgeClasses: light-card verdict pills — soft bg + readable -text, sharing the pill base', () => {
  assert.match(badgeClasses('success'), /bg-ds-success-soft.*text-ds-success-text/);
  assert.match(badgeClasses('warning'), /bg-ds-warning-soft.*text-ds-warning-text/);
  assert.match(badgeClasses('danger'), /bg-ds-danger-soft.*text-ds-danger-text/);
  assert.match(badgeClasses('neutral'), /bg-ds-neutral-soft.*text-ds-secondary/);
  for (const v of ['success', 'warning', 'danger', 'neutral'] as const) assert.match(badgeClasses(v), /rounded-full/);
});

test('verdictClasses: container + readable accent per variant', () => {
  assert.match(verdictClasses('success').container, /bg-ds-success-soft/);
  assert.match(verdictClasses('success').accent, /text-ds-success-text/);
  assert.match(verdictClasses('warning').accent, /text-ds-warning-text/);
  assert.match(verdictClasses('danger').accent, /text-ds-danger-text/);
});

test('buttonClasses: primary solid green; secondary soft-green; ghost neutral outline; all share the base', () => {
  assert.match(buttonClasses('primary'), /bg-ds-accent.*text-ds-accent-ink/);
  assert.match(buttonClasses('secondary'), /bg-ds-accent-soft.*text-ds-accent-text/);
  assert.match(buttonClasses('ghost'), /ring-ds-line-strong/);
  assert.ok(!buttonClasses('secondary').includes('text-ds-accent-ink'), 'secondary is not the solid accent fill');
  for (const v of ['primary', 'secondary', 'ghost'] as const) assert.match(buttonClasses(v), /rounded-lg/);
});
