// readiness.ts — stage 4 (the gate): is the plan actually implemented & firing?
//
// Pure, deterministic evaluator. Given a generated MeasurementPlan and an
// ObservedSignals snapshot of what actually fired on the (pre-launch / staging)
// URL, it reconciles the two and returns a ReadinessReport with a go/no-go
// verdict. No browser, no LLM — fully unit-testable. The live-capture adapter
// (tracking-spy -> ObservedSignals) and the streaming route layer on top.
//
// Gate philosophy — the two cardinal sins:
//   • FALSE PASS: clearing a site whose key conversion isn't actually firing
//     (or fires without its required parameters). Guarded by: key events drive
//     the verdict (a missing OR misconfigured key event is BLOCKING), opts are
//     validated (a NaN threshold can't silently pass everything), each observed
//     firing is claimed once (one firing can't satisfy two planned events), and
//     required params are checked against a SINGLE firing (not a cross-vendor
//     union that could paper over a gap).
//   • FALSE FAIL: blocking a site whose conversions all fire, purely because
//     some nice-to-have supporting event is missing. Guarded by: once every key
//     event is implemented, supporting-event gaps can only ever warn, never
//     fail; and the param check is lenient (an observed firing with NO captured
//     params is "unknown", not "missing", since capture is lossy).
//
// Matching is by CONSERVATIVE name normalization (case/separator-insensitive,
// no prefix/suffix stripping). Richer synonym/AI matching (lib/event-equivalence)
// can be layered at the live stage to upgrade 'missing' verdicts; the core stays
// pure. SCOPE: this stage verifies events fire by NAME — it does NOT verify the
// destination (which GA4 property / pixel received them). ObservedEvent carries
// vendor/destinationId for the live layer to add an opt-in destination check
// once the production measurement IDs are known.

import {
  READINESS_SCHEMA_VERSION,
  type EventReadiness,
  type MeasurementPlan,
  type ObservedEvent,
  type ObservedSignals,
  type ReadinessIssue,
  type ReadinessReport,
  type ReadinessVerdict,
  type TrackedEvent,
} from './types.ts';

// ─── Tunables ───

// Verdict thresholds on the weighted `overall` coverage score (0..1). `pass` is
// the cleanliness bar for a 'pass' once all key events fire; `warn` is the floor
// below which a plan with NO key events is considered too sparse to ship.
export const READINESS_THRESHOLDS = { pass: 0.9, warn: 0.6 } as const;

// Key events (conversions) carry more weight than supporting events.
const KEY_EVENT_WEIGHT = 3;
const NORMAL_EVENT_WEIGHT = 1;

// A 'misconfigured' event fired but is missing a required parameter — it gets
// partial credit in the score (it's closer to done than a missing event). Note
// this only colours the displayed score: a misconfigured KEY event still fails
// the gate via a blocking issue regardless of credit.
const MISCONFIGURED_CREDIT = 0.5;

export interface ReadinessOptions {
  // Override the pass/warn cutoffs on the overall coverage score.
  thresholds?: { pass: number; warn: number };
  keyEventWeight?: number;
  misconfiguredCredit?: number;
  // Check that matched events carry their required parameters. Default true.
  // Always conservative: an observed firing that captured NO parameters is
  // treated as "unknown" (capture is lossy), never as "missing a parameter".
  checkParameters?: boolean;
  // Injectable timestamp for deterministic meta (mirrors finalizePlan's `now`).
  now?: string;
}

// ─── Name normalization (conservative, pure) ───

// Lowercase, collapse runs of non-alphanumeric characters to single
// underscores, trim edge underscores. Deliberately does NOT strip
// prefixes/suffixes (unlike lib/event-equivalence.ts) to avoid over-collapsing
// distinct events (e.g. 'product_click' must not become 'product').
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── Input guards ───

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Throws a clear Error if inputs are structurally unusable. The plan normally
// arrives from our own (already validated) pipeline; this guards external
// callers and keeps the evaluator total over its declared input types.
export function validateReadinessInputs(plan: unknown, observed: unknown): void {
  if (!isObject(plan) || !Array.isArray(plan.events) || plan.events.length === 0) {
    throw new Error('Readiness: plan.events must be a non-empty array.');
  }
  if (!isObject(observed) || !Array.isArray(observed.events)) {
    throw new Error('Readiness: observed.events must be an array.');
  }
}

// Validate caller-supplied knobs. These directly flip the verdict, so a NaN /
// inverted / negative value must fail loudly rather than silently corrupt a
// go/no-go decision (e.g. a NaN threshold makes every `overall < NaN` false and
// would pass everything).
export function validateReadinessOptions(opts: ReadinessOptions): void {
  const t = opts.thresholds;
  if (t !== undefined) {
    for (const key of ['pass', 'warn'] as const) {
      const v = t[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`Readiness: thresholds.${key} must be a finite number in [0, 1].`);
      }
    }
    if (t.warn > t.pass) {
      throw new Error('Readiness: thresholds.warn must be <= thresholds.pass.');
    }
  }
  if (opts.keyEventWeight !== undefined && (!Number.isFinite(opts.keyEventWeight) || opts.keyEventWeight <= 0)) {
    throw new Error('Readiness: keyEventWeight must be a positive finite number.');
  }
  if (
    opts.misconfiguredCredit !== undefined &&
    (!Number.isFinite(opts.misconfiguredCredit) || opts.misconfiguredCredit < 0 || opts.misconfiguredCredit > 1)
  ) {
    throw new Error('Readiness: misconfiguredCredit must be a finite number in [0, 1].');
  }
}

// ─── Observed index ───

interface MergedObserved {
  name: string; // first-seen original (un-normalized) name, for display
  count: number;
  // One lowercased param-key set per contributing firing — kept SEPARATE (not
  // unioned) so a required param must be satisfied by a single real firing, not
  // pieced together across distinct events that share a normalized name.
  paramSets: Set<string>[];
  matched: boolean; // set true once a planned event claims it (claimed once)
}

// Collapse observed events by normalized name (summing counts, collecting each
// firing's params), and count rows we couldn't index (malformed or un-nameable)
// so the summary stays internally consistent.
function buildObservedIndex(events: ObservedEvent[]): {
  index: Map<string, MergedObserved>;
  skipped: number;
} {
  const index = new Map<string, MergedObserved>();
  let skipped = 0;
  for (const ev of events) {
    if (!ev || typeof ev.name !== 'string') {
      skipped += 1;
      continue;
    }
    const key = normalizeEventName(ev.name);
    if (!key) {
      skipped += 1;
      continue;
    }
    const paramSet = new Set((ev.parameters ?? []).map((p) => p.toLowerCase()));
    const existing = index.get(key);
    if (existing) {
      existing.count += ev.count ?? 1;
      existing.paramSets.push(paramSet);
    } else {
      index.set(key, { name: ev.name, count: ev.count ?? 1, paramSets: [paramSet], matched: false });
    }
  }
  return { index, skipped };
}

// ─── Per-event reconciliation ───

function reconcileEvent(
  ev: TrackedEvent,
  index: Map<string, MergedObserved>,
  checkParameters: boolean
): EventReadiness {
  const match = index.get(normalizeEventName(ev.name));

  // Not observed, or its firing was already claimed by an earlier planned event
  // that normalizes to the same name (a plan with duplicate/colliding names) —
  // either way this planned event has no distinct firing of its own.
  if (!match || match.matched) {
    return {
      eventId: ev.id,
      eventName: ev.name,
      isKeyEvent: ev.isKeyEvent,
      status: 'missing',
      matchedObservedName: null,
      observedCount: 0,
      missingRequiredParameters: [],
      detail: match
        ? `No distinct firing for "${ev.name}" — the observed "${match.name}" was already matched by another planned event (duplicate event name?).`
        : `No observed event matched "${ev.name}".`,
    };
  }

  match.matched = true;

  // Param completeness is judged per FIRING: an event is param-complete if any
  // single captured firing carried all required params. Firings with no params
  // captured are "unknown" and skipped (lenient).
  let missingRequiredParameters: string[] = [];
  const requiredParams = ev.parameters.filter((p) => p.required).map((p) => p.name);
  const knownFirings = match.paramSets.filter((s) => s.size > 0);
  if (checkParameters && requiredParams.length > 0 && knownFirings.length > 0) {
    let best = requiredParams;
    for (const firing of knownFirings) {
      const missing = requiredParams.filter((p) => !firing.has(p.toLowerCase()));
      if (missing.length < best.length) best = missing;
      if (best.length === 0) break;
    }
    missingRequiredParameters = best;
  }

  if (missingRequiredParameters.length > 0) {
    return {
      eventId: ev.id,
      eventName: ev.name,
      isKeyEvent: ev.isKeyEvent,
      status: 'misconfigured',
      matchedObservedName: match.name,
      observedCount: match.count,
      missingRequiredParameters,
      detail: `Fired as "${match.name}" but missing required parameter(s): ${missingRequiredParameters.join(', ')}.`,
    };
  }

  return {
    eventId: ev.id,
    eventName: ev.name,
    isKeyEvent: ev.isKeyEvent,
    status: 'implemented',
    matchedObservedName: match.name,
    observedCount: match.count,
    missingRequiredParameters: [],
    detail: `Implemented — observed firing as "${match.name}" (${match.count}×).`,
  };
}

// ─── Scoring & verdict ───

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Key events gate the launch; supporting events only grade quality.
//   • Any blocking issue (no signals, or a missing/misconfigured KEY event) → fail.
//   • Otherwise, if the plan has key events and they ALL fire correctly, the
//     worst possible verdict is 'warn' — supporting-event gaps never fail.
//   • A plan with NO key events is graded purely on overall coverage, with the
//     `warn` threshold as a sparseness floor below which it fails.
function decideVerdict(
  overall: number,
  keyTotal: number,
  keyEventCoverage: number,
  hasBlocking: boolean,
  hasWarning: boolean,
  thresholds: { pass: number; warn: number }
): ReadinessVerdict {
  if (hasBlocking) return 'fail';

  if (keyTotal > 0) {
    if (keyEventCoverage < 1) return 'fail'; // defense in depth (also blocking above)
    return hasWarning || overall < thresholds.pass ? 'warn' : 'pass';
  }

  if (overall < thresholds.warn) return 'fail';
  return hasWarning || overall < thresholds.pass ? 'warn' : 'pass';
}

// ─── Evaluate ───

export function evaluateReadiness(
  plan: MeasurementPlan,
  observed: ObservedSignals,
  opts: ReadinessOptions = {}
): ReadinessReport {
  validateReadinessInputs(plan, observed);
  validateReadinessOptions(opts);

  const thresholds = opts.thresholds ?? READINESS_THRESHOLDS;
  const keyWeight = opts.keyEventWeight ?? KEY_EVENT_WEIGHT;
  const misconfiguredCredit = opts.misconfiguredCredit ?? MISCONFIGURED_CREDIT;
  const checkParameters = opts.checkParameters ?? true;
  const now = opts.now ?? new Date().toISOString();

  const { index, skipped } = buildObservedIndex(observed.events);
  const events = plan.events.map((ev) => reconcileEvent(ev, index, checkParameters));

  // Weighted coverage + plain coverage counters.
  let weightSum = 0;
  let weightedCredit = 0;
  let implemented = 0;
  let keyTotal = 0;
  let keyImplemented = 0;
  for (const r of events) {
    const weight = r.isKeyEvent ? keyWeight : NORMAL_EVENT_WEIGHT;
    const credit =
      r.status === 'implemented' ? 1 : r.status === 'misconfigured' ? misconfiguredCredit : 0;
    weightSum += weight;
    weightedCredit += weight * credit;
    if (r.status === 'implemented') implemented += 1;
    if (r.isKeyEvent) {
      keyTotal += 1;
      if (r.status === 'implemented') keyImplemented += 1;
    }
  }
  // weightSum is always >= 1 here (events non-empty, every weight >= 1 given the
  // option guards); the 0 fallback is defensive and scores as 0, never perfect.
  const overall = weightSum === 0 ? 0 : clamp01(weightedCredit / weightSum);
  const eventCoverage = clamp01(implemented / events.length);
  const keyEventCoverage = keyTotal === 0 ? 1 : clamp01(keyImplemented / keyTotal);

  // Consent is "required" if the plan asks for Consent Mode or any event is
  // consent-gated. We can only verify a banner was found (the spy can't read
  // granular consent-mode state), so this is intentionally a soft check, and an
  // unknown (undefined) banner is not treated as a failure.
  const consentRequired =
    plan.consent.consentModeRequired || plan.events.some((e) => e.requiresConsent);
  const consentReady = !consentRequired || observed.consentBannerDetected !== false;

  // ─── Issues ───
  const issues: ReadinessIssue[] = [];

  if (observed.events.length === 0) {
    const raw = observed.rawHitCount ?? null;
    issues.push({
      severity: 'blocking',
      code: 'no_signals_captured',
      message:
        raw === 0 || raw === null
          ? 'No tracking signals were captured — nothing fired, or capture failed (check the staging URL is reachable and tags are deployed).'
          : `No recognized analytics events were captured, though ${raw} raw network hit(s) were seen — tags may be misconfigured or use an unsupported vendor.`,
    });
  }

  for (const r of events) {
    if (r.status === 'missing') {
      issues.push({
        severity: r.isKeyEvent ? 'blocking' : 'warning',
        code: r.isKeyEvent ? 'key_event_missing' : 'event_missing',
        message: r.isKeyEvent
          ? `Key event "${r.eventName}" is not firing — this is a launch blocker.`
          : `Event "${r.eventName}" is not firing.`,
        eventId: r.eventId,
      });
    } else if (r.status === 'misconfigured') {
      // A broken KEY conversion (firing without its required value/currency/etc.)
      // is as bad as a missing one for launch — escalate it to blocking.
      issues.push({
        severity: r.isKeyEvent ? 'blocking' : 'warning',
        code: r.isKeyEvent ? 'key_event_misconfigured' : 'event_misconfigured',
        message: r.isKeyEvent
          ? `Key event "${r.eventName}" is firing but missing required parameter(s): ${r.missingRequiredParameters.join(', ')} — conversion data is incomplete, a launch blocker.`
          : `Event "${r.eventName}" fired but is missing required parameter(s): ${r.missingRequiredParameters.join(', ')}.`,
        eventId: r.eventId,
      });
    }
  }

  if (consentRequired && observed.consentBannerDetected === false) {
    issues.push({
      severity: 'warning',
      code: 'consent_banner_not_detected',
      message:
        'The plan expects consent handling (Consent Mode / consent-gated events) but no consent banner was detected on the page.',
    });
  }

  // Observed events that no planned event claimed ("orphans"). Informational —
  // auto-collected events (page_view, session_start) commonly land here.
  const unplannedObservedEvents: string[] = [];
  for (const m of index.values()) {
    if (!m.matched) unplannedObservedEvents.push(m.name);
  }
  if (unplannedObservedEvents.length > 0) {
    issues.push({
      severity: 'info',
      code: 'unplanned_events',
      message: `Observed ${unplannedObservedEvents.length} event(s) firing that are not in the plan: ${unplannedObservedEvents.join(', ')}.`,
    });
  }

  const hasBlocking = issues.some((i) => i.severity === 'blocking');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const verdict = decideVerdict(overall, keyTotal, keyEventCoverage, hasBlocking, hasWarning, thresholds);

  const matchedObservedEvents = [...index.values()].filter((m) => m.matched).length;

  return {
    meta: {
      url: observed.url || plan.meta.url,
      planSchemaVersion: plan.meta.schemaVersion,
      readinessSchemaVersion: READINESS_SCHEMA_VERSION,
      evaluatedAt: now,
    },
    verdict,
    scores: { overall, eventCoverage, keyEventCoverage, consentReady },
    events,
    issues,
    observedSummary: {
      totalObservedEvents: index.size,
      matchedObservedEvents,
      unplannedObservedEvents,
      skippedObservedEvents: skipped,
      rawHitCount: observed.rawHitCount ?? null,
      consentBannerDetected: observed.consentBannerDetected ?? null,
      consentAccepted: observed.consentAccepted ?? null,
      consentMode: observed.consentMode ?? null,
      preConsent: observed.preConsent ?? null,
    },
  };
}
