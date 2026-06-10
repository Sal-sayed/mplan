// launch-readiness.ts — the pre-launch go/no-go gate (deterministic core).
//
// Runs AFTER a validated MeasurementPlan and BEFORE tracking goes live. Distinct
// from the early confirm-model gate (which returns 409 during plan generation):
// this is the final launch decision. This file builds ONLY the credential-free
// core — deterministic plan-consistency checks + the decision engine + report
// assembly. The nine LIVE checks (GA4 / GTM / deployed-site) depend on Google
// OAuth + GitHub credentials that don't exist yet, so they are DECLARED here and
// reported as 'skipped'; each becomes a real check fn when those connectors land.
//
// Pure and hand-rolled in the style of classify.ts / validateMeasurementPlan —
// no validation library. The plan shape is owned by types.ts; never redefined.

import { evaluateReadiness } from './readiness.ts';
import type { BusinessModel, MeasurementPlan, ObservedEvent, ObservedSignals, ReadinessReport } from './types.ts';

export const LAUNCH_READINESS_SCHEMA_VERSION = '0.1.0';

// ─── Public types ───

export type ReadinessCheckId =
  // Deterministic (plan-only) checks.
  | 'event_ids_unique'
  | 'plan_has_key_event'
  | 'key_events_reference_real_events'
  | 'kpi_links_resolve'
  | 'datalayer_refs_resolve'
  | 'datalayer_params_backed'
  | 'consent_coherent'
  // Live checks — declared this phase, implemented when credentials land.
  | 'ga4_property_exists'
  | 'ga4_key_events_registered'
  | 'ga4_custom_dimensions_created'
  | 'gtm_container_exists'
  | 'gtm_tags_configured'
  | 'tracking_snippet_present'
  | 'datalayer_variables_present'
  | 'planned_events_fire'
  | 'consent_mode_configured';

export type ReadinessCategory =
  | 'plan'
  | 'ga4'
  | 'gtm'
  | 'deployment'
  | 'dataLayer'
  | 'events'
  | 'consent';

// What a check needs in order to run. 'plan' checks are credential-free and run
// now; the rest are gated on a connector that isn't wired yet.
export type CheckDependency = 'plan' | 'ga4_oauth' | 'gtm_oauth' | 'deployed_site' | 'github';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  category: ReadinessCategory;
  name: string;
  status: CheckStatus;
  blocking: boolean;
  dependsOn: CheckDependency;
  summary: string;
  evidence?: string[];
  remediation?: string;
}

export type LaunchDecision = 'go' | 'go_with_warnings' | 'no_go';

export interface ReadinessMeta {
  url: string;
  businessModel: BusinessModel;
  planSchemaVersion: string;
  readinessSchemaVersion: string;
  generatedAt: string; // ISO 8601
}

export interface ApprovalState {
  required: boolean;
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
}

// Observed evidence, attached ONLY when a deployed-site capture ran — lets a UI
// render captured-vs-planned (what fired, rawHitCount, orphan events) without
// re-capturing. Sourced from the single ReadinessReport/ObservedSignals already
// produced; never a second browser run. `summary` reuses the evaluator's exact
// observedSummary shape rather than redefining it.
export interface LaunchObservedEvidence {
  summary: ReadinessReport['observedSummary'];
  events: ObservedEvent[];
}

export interface LaunchReadinessReport {
  meta: ReadinessMeta;
  decision: LaunchDecision;
  checks: ReadinessCheck[];
  blockingFailures: ReadinessCheckId[];
  warnings: ReadinessCheckId[];
  skipped: ReadinessCheckId[];
  approval: ApprovalState;
  // Present only when deployedSiteUrl was supplied and capture+reconcile ran;
  // omitted entirely on the deterministic-only path.
  observed?: LaunchObservedEvidence;
}

export interface LaunchReadinessResult {
  report: LaunchReadinessReport;
}

// Connector handles for the LIVE checks. Each is optional; an absent connector
// means its checks stay 'skipped'. Unused this phase (all live checks skip) —
// declared so the next phase can wire OAuth/GitHub without changing the contract.
export interface LaunchReadinessContext {
  url: string;
  plan: MeasurementPlan;
  connectors?: {
    ga4?: { propertyId: string };
    gtm?: { containerId: string };
    deployedSiteUrl?: string;
    repo?: { owner: string; name: string; ref?: string };
  };
}

export interface ReadinessCheckOptions {
  requireApproval?: boolean; // default true
  strictOnSkipped?: boolean; // treat a blocking skipped check as a no-go
  // Test/DI seam for the live-capture step. Defaults to the real Playwright
  // capture, dynamically imported so this pure module never loads a browser
  // unless a deployed-site URL is actually being checked.
  captureObservedSignals?: (url: string) => Promise<ObservedSignals>;
}

// ─── Plan index (built once, shared by the resolve checks) ───

interface PlanIndex {
  eventIds: Set<string>;
  keyEventIds: Set<string>; // ids of events whose isKeyEvent === true
}

function buildPlanIndex(plan: MeasurementPlan): PlanIndex {
  const eventIds = new Set<string>();
  const keyEventIds = new Set<string>();
  for (const ev of plan.events) {
    eventIds.add(ev.id);
    if (ev.isKeyEvent) keyEventIds.add(ev.id);
  }
  return { eventIds, keyEventIds };
}

// ─── Deterministic checks (plan only, dependsOn 'plan') ───

function checkEventIdsUnique(plan: MeasurementPlan): ReadinessCheck {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const ev of plan.events) {
    if (seen.has(ev.id)) dupes.add(ev.id);
    seen.add(ev.id);
  }
  const dupeList = [...dupes];
  const pass = dupeList.length === 0;
  return {
    id: 'event_ids_unique',
    category: 'events',
    name: 'Event IDs are unique',
    status: pass ? 'pass' : 'fail',
    blocking: true,
    dependsOn: 'plan',
    summary: pass ? 'All event IDs are unique.' : `Duplicate event id(s): ${dupeList.join(', ')}.`,
    evidence: pass ? undefined : dupeList,
    remediation: pass ? undefined : 'Give every tracked event a unique id.',
  };
}

function checkPlanHasKeyEvent(plan: MeasurementPlan): ReadinessCheck {
  const hasKeyEvent = plan.events.some((e) => e.isKeyEvent);
  const hasGa4KeyEvents = plan.tooling.ga4.keyEvents.length > 0;
  const pass = hasKeyEvent && hasGa4KeyEvents;
  const problems: string[] = [];
  if (!hasKeyEvent) problems.push('no event is marked isKeyEvent');
  if (!hasGa4KeyEvents) problems.push('tooling.ga4.keyEvents is empty');
  return {
    id: 'plan_has_key_event',
    category: 'events',
    name: 'Plan defines at least one key event',
    status: pass ? 'pass' : 'fail',
    blocking: true,
    dependsOn: 'plan',
    summary: pass
      ? 'At least one key event is defined and registered in GA4 tooling.'
      : `Missing key event: ${problems.join('; ')}.`,
    evidence: pass ? undefined : problems,
    remediation: pass ? undefined : 'Mark a conversion event isKeyEvent and list it in tooling.ga4.keyEvents.',
  };
}

function checkKeyEventsReferenceRealEvents(plan: MeasurementPlan, idx: PlanIndex): ReadinessCheck {
  // A registered GA4 key event must point at an event that exists AND is a key event.
  const dangling = plan.tooling.ga4.keyEvents.filter((id) => !idx.keyEventIds.has(id));
  const pass = dangling.length === 0;
  return {
    id: 'key_events_reference_real_events',
    category: 'ga4',
    name: 'GA4 key events reference real key events',
    status: pass ? 'pass' : 'fail',
    blocking: true,
    dependsOn: 'plan',
    summary: pass
      ? 'Every GA4 key event maps to a real key event in the plan.'
      : `GA4 keyEvents not matching a key event id: ${dangling.join(', ')}.`,
    evidence: pass ? undefined : dangling,
    remediation: pass ? undefined : 'Point tooling.ga4.keyEvents only at event ids whose isKeyEvent is true.',
  };
}

function checkKpiLinksResolve(plan: MeasurementPlan, idx: PlanIndex): ReadinessCheck {
  const dangling: string[] = [];
  for (const kpi of plan.kpis) {
    for (const evId of kpi.linkedEventIds) {
      if (!idx.eventIds.has(evId)) dangling.push(`${kpi.id} → ${evId}`);
    }
  }
  const pass = dangling.length === 0;
  return {
    id: 'kpi_links_resolve',
    category: 'plan',
    name: 'KPI links resolve to real events',
    status: pass ? 'pass' : 'fail',
    blocking: true,
    dependsOn: 'plan',
    summary: pass
      ? 'Every KPI links to a real event.'
      : `KPI links with no matching event: ${dangling.join(', ')}.`,
    evidence: pass ? undefined : dangling,
    remediation: pass ? undefined : 'Point each kpi.linkedEventIds entry at an existing event id.',
  };
}

function checkDataLayerRefsResolve(plan: MeasurementPlan, idx: PlanIndex): ReadinessCheck {
  const dangling: string[] = [];
  for (const dl of plan.dataLayer) {
    for (const evId of dl.usedByEventIds) {
      if (!idx.eventIds.has(evId)) dangling.push(`${dl.key} → ${evId}`);
    }
  }
  const pass = dangling.length === 0;
  return {
    id: 'datalayer_refs_resolve',
    category: 'dataLayer',
    name: 'dataLayer references resolve to real events',
    status: pass ? 'pass' : 'warn',
    blocking: false,
    dependsOn: 'plan',
    summary: pass
      ? 'Every dataLayer variable references a real event.'
      : `dataLayer references with no matching event: ${dangling.join(', ')}.`,
    evidence: pass ? undefined : dangling,
    remediation: pass ? undefined : 'Point each dataLayer usedByEventIds entry at an existing event id.',
  };
}

function checkDataLayerParamsBacked(plan: MeasurementPlan): ReadinessCheck {
  const dlKeys = new Set(plan.dataLayer.map((d) => d.key));
  const unbacked: string[] = [];
  for (const ev of plan.events) {
    for (const p of ev.parameters) {
      if (p.source === 'dataLayer' && !dlKeys.has(p.name)) {
        unbacked.push(`${ev.name}.${p.name}`);
      }
    }
  }
  const pass = unbacked.length === 0;
  return {
    id: 'datalayer_params_backed',
    category: 'dataLayer',
    name: 'dataLayer-sourced params are backed by a variable',
    status: pass ? 'pass' : 'warn',
    blocking: false,
    dependsOn: 'plan',
    summary: pass
      ? 'Every dataLayer-sourced parameter has a matching dataLayer variable.'
      : `dataLayer-sourced params with no matching variable: ${unbacked.join(', ')}.`,
    evidence: pass ? undefined : unbacked,
    remediation: pass ? undefined : 'Add a DataLayerVariable whose key matches each dataLayer-sourced parameter name.',
  };
}

function checkConsentCoherent(plan: MeasurementPlan): ReadinessCheck {
  const { consent } = plan;
  // Conditionally blocking: only a hard gate when Consent Mode is required.
  const blocking = consent.consentModeRequired === true;
  const problems: string[] = [];

  const anyRequiresConsent = plan.events.some((e) => e.requiresConsent);
  if (anyRequiresConsent && !consent.categoriesUsed.includes('analytics')) {
    problems.push("events set requiresConsent but consent.categoriesUsed is missing 'analytics'");
  }
  if (consent.consentModeRequired && consent.categoriesUsed.length === 0) {
    problems.push('consentModeRequired is true but consent.categoriesUsed is empty');
  }

  const pass = problems.length === 0;
  const status: CheckStatus = pass ? 'pass' : consent.consentModeRequired ? 'fail' : 'warn';
  return {
    id: 'consent_coherent',
    category: 'consent',
    name: 'Consent configuration is coherent',
    status,
    blocking,
    dependsOn: 'plan',
    summary: pass
      ? 'Consent categories and Consent Mode requirements are coherent.'
      : `Consent issues: ${problems.join('; ')}.`,
    evidence: pass ? undefined : problems,
    remediation: pass
      ? undefined
      : "Add 'analytics' to consent.categoriesUsed for consent-gated events, and populate categoriesUsed when Consent Mode is required.",
  };
}

// ─── Live checks (declared, not implemented) ───

function skippedLiveCheck(
  id: ReadinessCheckId,
  category: ReadinessCategory,
  dependsOn: CheckDependency,
  name: string,
  blocking: boolean
): ReadinessCheck {
  return {
    id,
    category,
    name,
    status: 'skipped',
    blocking,
    dependsOn,
    summary: `Deferred — requires ${dependsOn} (next phase).`,
  };
}

// ─── Deployed-site checks: thin projections of one ReadinessReport ───
//
// These read evaluateReadiness's output — they do NOT re-capture or re-reconcile.
// The check identity (id / category / dependsOn / blocking) stays identical to
// the skipped versions; only status + summary + evidence come from the report.

// "Do the planned events fire?" — non-blocking, so gaps surface as 'warn' (the
// summary still calls out any KEY-event gap loudly). A total capture miss is the
// blocking tracking_snippet_present check's job, not this one.
export function projectPlannedEventsFire(report: ReadinessReport): ReadinessCheck {
  const gaps = report.events.filter((e) => e.status !== 'implemented');
  const keyGaps = gaps.filter((e) => e.isKeyEvent).map((e) => `${e.eventName} (${e.status})`);
  const pct = Math.round(report.scores.keyEventCoverage * 100);
  const status: CheckStatus = gaps.length === 0 ? 'pass' : 'warn';
  const summary =
    gaps.length === 0
      ? `All ${report.events.length} planned events are firing (key-event coverage ${pct}%).`
      : keyGaps.length > 0
        ? `${gaps.length}/${report.events.length} planned events not firing — including KEY event(s): ${keyGaps.join(', ')}. Key-event coverage ${pct}%.`
        : `${gaps.length}/${report.events.length} supporting events not firing; all key events fire (coverage ${pct}%).`;
  return {
    id: 'planned_events_fire',
    category: 'events',
    name: 'Planned events fire on the live site',
    status,
    blocking: false,
    dependsOn: 'deployed_site',
    summary,
    evidence: gaps.length === 0 ? undefined : gaps.map((e) => `${e.eventName} (${e.status})`),
    remediation: gaps.length === 0 ? undefined : 'Implement/trigger the missing events so they fire with their required parameters.',
  };
}

// "Is tracking present?" — blocking. A clean capture with no signals at all means
// the GA4/GTM snippet is missing or blocked → fail (→ no_go).
export function projectTrackingSnippetPresent(report: ReadinessReport): ReadinessCheck {
  const noSignals = report.issues.filter((i) => i.code === 'no_signals_captured');
  const raw = report.observedSummary.rawHitCount;
  const status: CheckStatus = noSignals.length > 0 ? 'fail' : 'pass';
  return {
    id: 'tracking_snippet_present',
    category: 'deployment',
    name: 'Tracking snippet present on the site',
    status,
    blocking: true,
    dependsOn: 'deployed_site',
    summary:
      status === 'fail'
        ? 'No tracking signals were captured — the GA4/GTM snippet appears missing, blocked, or not firing.'
        : `Tracking is firing on the site (${report.observedSummary.totalObservedEvents} recognized event(s)${raw != null ? `, ${raw} raw hit(s)` : ''}).`,
    evidence: status === 'fail' ? noSignals.map((i) => i.message) : undefined,
    remediation: status === 'fail' ? 'Confirm the GTM/GA4 snippet is installed on the deployed page and not blocked by consent or an ad-blocker.' : undefined,
  };
}

// PARTIAL by nature: the spy sees a consent BANNER, not granular Consent Mode
// state (consent_default/update are filtered). Never a confident green — always
// 'warn', scoped in the summary. Blocking only when the plan requires Consent Mode.
export function projectConsentModeConfigured(report: ReadinessReport, consentModeRequired: boolean): ReadinessCheck {
  const detected = report.observedSummary.consentBannerDetected;
  const accepted = report.observedSummary.consentAccepted;
  const bannerNote =
    detected === true
      ? `a consent banner was detected${accepted ? ' and accepted' : ''}`
      : detected === false
        ? 'no consent banner was detected'
        : 'consent banner state is unknown';
  return {
    id: 'consent_mode_configured',
    category: 'consent',
    name: 'Consent Mode configured on the site',
    status: 'warn',
    blocking: consentModeRequired,
    dependsOn: 'deployed_site',
    summary: `Partial check: ${bannerNote}, but Google Consent Mode configuration is NOT verifiable from page capture (the spy filters consent_default/update). Verify Consent Mode manually or via the GA4/GTM checks in the next phase.`,
    evidence: [
      `consentBannerDetected=${detected ?? 'unknown'}`,
      `consentAccepted=${accepted ?? 'unknown'}`,
      `consentReady=${report.scores.consentReady}`,
    ],
    remediation: 'Manually confirm Consent Mode v2 default/update signals on the deployed site; full verification arrives with the GA4/GTM OAuth checks.',
  };
}

// PARTIAL by nature: we observe parameter keys on events that actually fired, not
// a standalone inventory of every planned dataLayer variable. Report honestly as
// 'warn' rather than overclaim; list any required params missing on fired events.
export function projectDataLayerVariablesPresent(report: ReadinessReport): ReadinessCheck {
  const missing = report.events
    .filter((e) => e.missingRequiredParameters.length > 0)
    .map((e) => `${e.eventName}: ${e.missingRequiredParameters.join(', ')}`);
  return {
    id: 'datalayer_variables_present',
    category: 'dataLayer',
    name: 'dataLayer variables present at runtime',
    status: 'warn',
    blocking: false,
    dependsOn: 'deployed_site',
    summary:
      missing.length > 0
        ? `Partial check: required parameter(s) missing on fired events: ${missing.join('; ')}. (Observed-param presence only — not a full dataLayer-variable inventory.)`
        : 'Partial check: dataLayer-sourced parameters on the events that fired were present, but a full dataLayer-variable inventory is not verifiable from page capture.',
    evidence: missing.length > 0 ? missing : undefined,
    remediation: 'Verify each planned dataLayer variable is pushed at runtime; capture only confirms parameters on events that actually fired.',
  };
}

// Build the 4 deployed-site checks from one ReadinessReport (one capture, one reconcile).
function projectDeployedSiteChecks(report: ReadinessReport, consentModeRequired: boolean): ReadinessCheck[] {
  return [
    projectPlannedEventsFire(report),
    projectTrackingSnippetPresent(report),
    projectDataLayerVariablesPresent(report),
    projectConsentModeConfigured(report, consentModeRequired),
  ];
}

// The 4 deployed-site checks, still 'skipped' (no deployed-site URL supplied).
function skippedDeployedSiteChecks(consentModeRequired: boolean): ReadinessCheck[] {
  return [
    skippedLiveCheck('planned_events_fire', 'events', 'deployed_site', 'Planned events fire on the live site', false),
    skippedLiveCheck('tracking_snippet_present', 'deployment', 'deployed_site', 'Tracking snippet present on the site', true),
    skippedLiveCheck('datalayer_variables_present', 'dataLayer', 'deployed_site', 'dataLayer variables present at runtime', false),
    skippedLiveCheck('consent_mode_configured', 'consent', 'deployed_site', 'Consent Mode configured on the site', consentModeRequired),
  ];
}

// Lazily load the real Playwright capture only when actually checking a deployed
// site — keeps the browser/scraper out of this pure module's static graph.
async function loadDefaultCapture(): Promise<(url: string) => Promise<ObservedSignals>> {
  const mod = await import('./live-capture.ts');
  return mod.captureObservedSignals;
}

// ─── Decision engine + report assembly ───

export async function runLaunchReadinessGate(
  ctx: LaunchReadinessContext,
  opts: ReadinessCheckOptions = {},
  now: string = new Date().toISOString()
): Promise<LaunchReadinessResult> {
  const { plan } = ctx;
  const idx = buildPlanIndex(plan);

  const deterministic: ReadinessCheck[] = [
    checkEventIdsUnique(plan),
    checkPlanHasKeyEvent(plan),
    checkKeyEventsReferenceRealEvents(plan, idx),
    checkKpiLinksResolve(plan, idx),
    checkDataLayerRefsResolve(plan, idx),
    checkDataLayerParamsBacked(plan),
    checkConsentCoherent(plan),
  ];

  const consentModeRequired = plan.consent.consentModeRequired === true;

  // Deployed-site checks: when a deployed/staging URL is supplied, capture ONCE,
  // reconcile ONCE (evaluateReadiness), and project that single report into the 4
  // deployed_site checks. Without a URL they stay 'skipped' exactly as before.
  const deployedSiteUrl = ctx.connectors?.deployedSiteUrl;
  let deployedSiteChecks: ReadinessCheck[];
  let observedEvidence: LaunchObservedEvidence | undefined;
  if (deployedSiteUrl) {
    const capture = opts.captureObservedSignals ?? (await loadDefaultCapture());
    const observed = await capture(deployedSiteUrl);
    const report = evaluateReadiness(plan, observed);
    deployedSiteChecks = projectDeployedSiteChecks(report, consentModeRequired);
    // Same report/observed we just produced — no re-capture, no re-reconcile.
    observedEvidence = { summary: report.observedSummary, events: observed.events };
  } else {
    deployedSiteChecks = skippedDeployedSiteChecks(consentModeRequired);
  }

  // The 5 GA4/GTM OAuth checks ALWAYS stay skipped this phase.
  const oauthChecks: ReadinessCheck[] = [
    skippedLiveCheck('ga4_property_exists', 'ga4', 'ga4_oauth', 'GA4 property exists', true),
    skippedLiveCheck('ga4_key_events_registered', 'ga4', 'ga4_oauth', 'GA4 key events registered', true),
    skippedLiveCheck('ga4_custom_dimensions_created', 'ga4', 'ga4_oauth', 'GA4 custom dimensions created', true),
    skippedLiveCheck('gtm_container_exists', 'gtm', 'gtm_oauth', 'GTM container exists', true),
    skippedLiveCheck('gtm_tags_configured', 'gtm', 'gtm_oauth', 'GTM tags configured', false),
  ];

  const checks = [...deterministic, ...deployedSiteChecks, ...oauthChecks];

  const blockingFailures = checks.filter((c) => c.blocking && c.status === 'fail').map((c) => c.id);
  const warnings = checks.filter((c) => c.status === 'warn').map((c) => c.id);
  const skipped = checks.filter((c) => c.status === 'skipped').map((c) => c.id);

  let decision: LaunchDecision;
  if (blockingFailures.length > 0) {
    decision = 'no_go';
  } else if (opts.strictOnSkipped && checks.some((c) => c.blocking && c.status === 'skipped')) {
    decision = 'no_go';
  } else if (checks.some((c) => c.status === 'warn' || c.status === 'skipped')) {
    decision = 'go_with_warnings';
  } else {
    // Unreachable while every live check is skipped — a fully verified 'go'
    // requires the live checks to run and pass in the next phase.
    decision = 'go';
  }

  const approval: ApprovalState = {
    required: (opts.requireApproval ?? true) && decision !== 'no_go',
  };

  const report: LaunchReadinessReport = {
    meta: {
      url: ctx.url,
      businessModel: plan.meta.businessModel,
      planSchemaVersion: plan.meta.schemaVersion,
      readinessSchemaVersion: LAUNCH_READINESS_SCHEMA_VERSION,
      generatedAt: now,
    },
    decision,
    checks,
    blockingFailures,
    warnings,
    skipped,
    approval,
    ...(observedEvidence ? { observed: observedEvidence } : {}),
  };

  return { report };
}
