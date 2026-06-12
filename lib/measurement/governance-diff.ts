// governance-diff.ts — drift detection between two governance/launch-readiness
// runs. Lifts the PHILOSOPHY of the removed monitor-diff (a three-state verdict
// gated so that "we couldn't verify" never masquerades as "it broke"), but none
// of its capture-model code. We diff by ReadinessCheckId status transitions
// only — no CapturedEvent / paramKeys / pagesFiredOn.
//
//   ok           — no check regressed and nothing went unverifiable.
//   regression   — a check pass→fail or pass→warn (degraded), or the top-level
//                  decision dropped to no_go. These are CONFIRMED — both runs
//                  actually verified the check.
//   inconclusive — a previously-verified check went →skipped this run (its
//                  connector / deployed URL dropped), so we couldn't re-check.
//                  LOAD-BEARING GATE: a skipped check is NEVER a regression.
//                  Silence beats a false alarm.

import type {
  LaunchReadinessReport,
  ReadinessCheck,
  ReadinessCheckId,
  CheckStatus,
  LaunchDecision,
} from './launch-readiness.ts';

export type DriftVerdict = 'ok' | 'regression' | 'inconclusive';

export type TransitionKind =
  | 'regressed' // pass/warn → fail
  | 'degraded' // pass → warn
  | 'recovered' // worse → better (informational)
  | 'inconclusive' // (real status) → skipped this run
  | 'unchanged';

export interface CheckTransition {
  id: ReadinessCheckId;
  from: CheckStatus;
  to: CheckStatus;
  kind: TransitionKind;
}

export interface GovernanceDrift {
  verdict: DriftVerdict;
  // Set only when the top-level launch decision changed between runs.
  decisionChange?: { from: LaunchDecision; to: LaunchDecision };
  regressions: ReadinessCheckId[]; // checks that regressed (pass→fail / pass→warn)
  inconclusive: ReadinessCheckId[]; // checks that became unverifiable (→skipped)
  transitions: CheckTransition[]; // every non-trivial transition, for detail/UI
  summary: string;
}

// Quality ordering among the three REAL (verified) statuses. 'skipped' is NOT
// ranked — it means "not verified this run" and is handled before this map is
// consulted, so a skip can never be scored as "worse".
const RANK: Record<'pass' | 'warn' | 'fail', number> = { pass: 2, warn: 1, fail: 0 };

function isReal(s: CheckStatus): s is 'pass' | 'warn' | 'fail' {
  return s === 'pass' || s === 'warn' || s === 'fail';
}

function indexById(checks: ReadinessCheck[]): Map<ReadinessCheckId, ReadinessCheck> {
  return new Map(checks.map((c) => [c.id, c]));
}

export function diffReports(
  prev: LaunchReadinessReport,
  curr: LaunchReadinessReport
): GovernanceDrift {
  const prevById = indexById(prev.checks);
  const currById = indexById(curr.checks);

  const regressions: ReadinessCheckId[] = [];
  const inconclusive: ReadinessCheckId[] = [];
  const transitions: CheckTransition[] = [];

  // Only checks present in BOTH runs are comparable.
  for (const [id, before] of prevById) {
    const after = currById.get(id);
    if (!after) continue;
    const from = before.status;
    const to = after.status;
    if (from === to) continue;

    // GATE: a check that went unverifiable this run is inconclusive, never a
    // regression — regardless of how it stood before. We refuse to claim a break
    // we could not actually observe.
    if (to === 'skipped') {
      // Only meaningful if we previously HAD a verdict to lose.
      if (from !== 'skipped') {
        inconclusive.push(id);
        transitions.push({ id, from, to, kind: 'inconclusive' });
      }
      continue;
    }

    // from 'skipped' → a real status: first verified result for this check
    // (no trustworthy baseline). Don't alarm — surface only if it's a pass
    // (recovered visibility), otherwise leave it as a neutral transition.
    if (!isReal(from)) {
      transitions.push({ id, from, to, kind: to === 'pass' ? 'recovered' : 'unchanged' });
      continue;
    }

    // Both runs verified the check — compare quality.
    if (RANK[to] < RANK[from]) {
      regressions.push(id);
      transitions.push({ id, from, to, kind: to === 'fail' ? 'regressed' : 'degraded' });
    } else {
      transitions.push({ id, from, to, kind: 'recovered' });
    }
  }

  // Top-level decision change. A drop TO no_go (from a launchable state) is a
  // confirmed regression; other changes are recorded but don't, on their own,
  // flip the verdict.
  let decisionChange: { from: LaunchDecision; to: LaunchDecision } | undefined;
  let decisionRegressed = false;
  if (prev.decision !== curr.decision) {
    decisionChange = { from: prev.decision, to: curr.decision };
    if (curr.decision === 'no_go') decisionRegressed = true;
  }

  // Verdict. A confirmed regression dominates — a genuine pass→fail elsewhere
  // still alerts even if some other check went inconclusive this run.
  let verdict: DriftVerdict;
  let summary: string;
  if (regressions.length > 0 || decisionRegressed) {
    verdict = 'regression';
    const parts: string[] = [];
    if (regressions.length > 0) parts.push(`${regressions.length} check(s) regressed: ${regressions.join(', ')}`);
    if (decisionRegressed) parts.push(`launch decision dropped to no_go`);
    summary = `Tracking regression — ${parts.join('; ')}.`;
  } else if (inconclusive.length > 0) {
    verdict = 'inconclusive';
    summary =
      `No confirmed regression, but ${inconclusive.length} check(s) couldn't be verified this run ` +
      `(now skipped: ${inconclusive.join(', ')}). Treating as inconclusive, not a break.`;
  } else {
    verdict = 'ok';
    summary = 'No drift — all comparable checks held steady.';
  }

  return { verdict, decisionChange, regressions, inconclusive, transitions, summary };
}
