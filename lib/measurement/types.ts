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
