// types.ts — the keystone schema for the 'new' (pre-launch) measurement pipeline.
//
// This is the SINGLE source of truth for the measurement-plan shape. The
// classifier writes toward it, Gemini fills it, the route validates + stamps
// it, the UI renders it, and the audit path can later reconcile against it.
// Never duplicate this shape elsewhere — import from here.

export const PLAN_SCHEMA_VERSION = '1.0.0';

export type SiteMode = 'new' | 'audit';

export type BusinessModel =
  | 'ecommerce'
  | 'saas'
  | 'lead_gen'
  | 'media_content'
  | 'marketplace';

// ─── Site context (pipeline input) ───

export interface PageInfo {
  path: string;
  title?: string;
}

export interface FormInfo {
  action?: string;
  fields: string[];
  purpose?: string;
}

// The 'new' path only — a pre-launch site we describe rather than audit.
export interface SiteContext {
  mode: 'new';
  url: string;
  pages?: PageInfo[];
  forms?: FormInfo[];
  detectedStack?: string[];
  brief?: string;
}

// ─── Classification (stage 2 output) ───

export interface Classification {
  businessModel: BusinessModel;
  vertical: string;
  primaryKpis: string[];
  confidence: number; // 0..1
  rationale: string;
  signals: string[];
}

// ─── Measurement plan (stage 3 output) ───

export type EventCategory =
  | 'page'
  | 'engagement'
  | 'ecommerce'
  | 'form'
  | 'conversion'
  | 'custom';

export type ParameterType = 'string' | 'number' | 'boolean';

export type ParameterSource = 'dataLayer' | 'gtm' | 'page';

export interface EventParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  source: ParameterSource;
}

export interface TrackedEvent {
  id: string;
  name: string; // GA4 snake_case — /^[a-z0-9_]+$/
  category: EventCategory;
  description: string;
  trigger: string;
  isKeyEvent: boolean;
  requiresConsent: boolean;
  parameters: EventParameter[];
}

export interface Kpi {
  id: string;
  name: string;
  description: string;
  metric: string;
  linkedEventIds: string[];
}

export type DataLayerVariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array';

export interface DataLayerVariable {
  key: string;
  type: DataLayerVariableType;
  description: string;
  example: string;
  usedByEventIds: string[];
}

export type ConsentCategory =
  | 'necessary'
  | 'analytics'
  | 'marketing'
  | 'preferences';

export interface ConsentPlan {
  categoriesUsed: ConsentCategory[];
  consentModeRequired: boolean;
  notes: string;
}

export interface CustomDimension {
  name: string;
  scope: 'event' | 'user';
  parameter: string;
}

export interface ToolingConfig {
  ga4: {
    keyEvents: string[];
    customDimensions: CustomDimension[];
  };
  gtm: {
    suggestedTagCount: number;
    notes: string;
  };
}

export interface PlanMeta {
  url: string;
  businessModel: BusinessModel;
  vertical: string;
  generatedAt: string; // ISO 8601
  schemaVersion: string;
  classificationConfidence: number;
  // Provenance — 'gemini' = AI-tailored, 'template' = deterministic baseline
  // fallback (AI unavailable or no-AI path). Optional/additive; absence = gemini.
  source?: 'gemini' | 'template';
}

export interface MeasurementPlan {
  meta: PlanMeta;
  kpis: Kpi[];
  events: TrackedEvent[];
  dataLayer: DataLayerVariable[];
  consent: ConsentPlan;
  tooling: ToolingConfig;
}

// ─── Pipeline result ───

export interface PipelineResult {
  classification: Classification;
  plan: MeasurementPlan;
}

// ─── Launch readiness (gate) ───
//
// Inputs/outputs for the deterministic readiness evaluator (readiness.ts).
// ObservedSignals is a capture-agnostic view of what actually fired on a
// (pre-launch / staging) URL — the live-capture adapter maps the tracking-spy
// output into this shape so the evaluator never depends on Playwright or the
// spy internals. The evaluator reconciles a MeasurementPlan against it and
// returns a go/no-go ReadinessReport.

export const READINESS_SCHEMA_VERSION = '1.0.0';

// A single tracking event observed firing on the page.
export interface ObservedEvent {
  name: string; // event name as fired (e.g. 'purchase', 'add_to_cart')
  vendor?: string; // canonical destination key, e.g. 'GA4', 'MetaPixel'
  destinationId?: string; // GA4 measurementId / pixel id that received it
  parameters?: string[]; // observed parameter KEYS (best-effort; capture is lossy)
  count?: number; // how many times it fired during capture
}

// Granular Google Consent Mode state read from window.dataLayer at capture time.
// Distinct from the consent BANNER signal: the banner tells us a CMP exists, this
// tells us whether Consent Mode default/update signals (and v2 ad_* signals) are
// actually present on the page. Sourced from the scraper's existing dataLayer
// read (lib/scraper.ts readConsentModeStatus), not a new scanner.
export interface ConsentModeStatus {
  active: boolean; // any consent default OR update seen in the dataLayer
  hasDefault: boolean; // a `consent default` push was present
  hasUpdate: boolean; // a `consent update` push was present
  version: string | null; // 'v2' when ad_user_data/ad_personalization present, 'v1' when only basic, else null
  hasV2Signals: boolean; // ad_user_data / ad_personalization present in a consent payload
}

// What fired BEFORE consent was accepted (slice 2: pre-consent enforcement). Read
// from the SAME tracking-spy buffer earlier in the same capture — before
// detectAndAcceptConsent runs — so any tracking here fired without the user's
// agreement. `ran` distinguishes "observed, nothing fired" (compliant) from
// "couldn't observe" (inconclusive — never a false violation).
export interface PreConsentObservation {
  ran: boolean; // the pre-consent window was actually observed
  events: ObservedEvent[]; // tracking events captured before consent acceptance
  rawHitCount: number; // raw hits seen in the pre-consent window
}

// What actually fired on the page, normalized away from the spy's internals.
export interface ObservedSignals {
  url: string;
  events: ObservedEvent[];
  rawHitCount?: number; // total raw hits seen — a capture-health sanity check
  consentBannerDetected?: boolean;
  consentAccepted?: boolean;
  consentMode?: ConsentModeStatus; // granular Consent Mode read (when captured)
  preConsent?: PreConsentObservation; // what fired before consent (slice 2)
}

export type EventReadinessStatus = 'implemented' | 'missing' | 'misconfigured';
export type ReadinessVerdict = 'pass' | 'warn' | 'fail';
export type ReadinessSeverity = 'blocking' | 'warning' | 'info';

// Per-planned-event reconciliation outcome.
export interface EventReadiness {
  eventId: string;
  eventName: string;
  isKeyEvent: boolean;
  status: EventReadinessStatus;
  matchedObservedName: string | null; // the observed name that satisfied it
  observedCount: number;
  missingRequiredParameters: string[]; // populated when status === 'misconfigured'
  detail: string;
}

export interface ReadinessIssue {
  severity: ReadinessSeverity;
  code: string; // stable machine code, e.g. 'key_event_missing'
  message: string;
  eventId?: string;
}

export interface ReadinessScores {
  overall: number; // 0..1 weighted coverage (key events weighted heavier)
  eventCoverage: number; // 0..1 implemented / total events
  keyEventCoverage: number; // 0..1 implemented / total key events (1 if none)
  consentReady: boolean;
}

export interface ReadinessReport {
  meta: {
    url: string;
    planSchemaVersion: string;
    readinessSchemaVersion: string;
    evaluatedAt: string; // ISO 8601
  };
  verdict: ReadinessVerdict;
  scores: ReadinessScores;
  events: EventReadiness[];
  issues: ReadinessIssue[];
  observedSummary: {
    totalObservedEvents: number; // distinct recognized events (= matched + unplanned)
    matchedObservedEvents: number;
    unplannedObservedEvents: string[]; // observed but not in the plan ("orphans")
    skippedObservedEvents: number; // rows dropped as malformed / un-nameable
    rawHitCount: number | null;
    consentBannerDetected: boolean | null;
    consentAccepted: boolean | null;
    consentMode: ConsentModeStatus | null; // granular Consent Mode read, when captured
    preConsent: PreConsentObservation | null; // what fired before consent (slice 2)
  };
}
