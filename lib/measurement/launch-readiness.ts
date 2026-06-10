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

import type { BusinessModel, MeasurementPlan } from './types.ts';

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

export interface LaunchReadinessReport {
  meta: ReadinessMeta;
  decision: LaunchDecision;
  checks: ReadinessCheck[];
  blockingFailures: ReadinessCheckId[];
  warnings: ReadinessCheckId[];
  skipped: ReadinessCheckId[];
  approval: ApprovalState;
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

  // Live checks gate a launch when listed blocking below. consent_mode_configured
  // only blocks when the plan actually requires Consent Mode.
  const consentModeRequired = plan.consent.consentModeRequired === true;
  const live: ReadinessCheck[] = [
    skippedLiveCheck('ga4_property_exists', 'ga4', 'ga4_oauth', 'GA4 property exists', true),
    skippedLiveCheck('ga4_key_events_registered', 'ga4', 'ga4_oauth', 'GA4 key events registered', true),
    skippedLiveCheck('ga4_custom_dimensions_created', 'ga4', 'ga4_oauth', 'GA4 custom dimensions created', true),
    skippedLiveCheck('gtm_container_exists', 'gtm', 'gtm_oauth', 'GTM container exists', true),
    skippedLiveCheck('gtm_tags_configured', 'gtm', 'gtm_oauth', 'GTM tags configured', false),
    skippedLiveCheck('tracking_snippet_present', 'deployment', 'deployed_site', 'Tracking snippet present on the site', true),
    skippedLiveCheck('datalayer_variables_present', 'dataLayer', 'deployed_site', 'dataLayer variables present at runtime', false),
    skippedLiveCheck('planned_events_fire', 'events', 'deployed_site', 'Planned events fire on the live site', false),
    skippedLiveCheck('consent_mode_configured', 'consent', 'deployed_site', 'Consent Mode configured on the site', consentModeRequired),
  ];

  const checks = [...deterministic, ...live];

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
  };

  return { report };
}
