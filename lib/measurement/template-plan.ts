// template-plan.ts — deterministic, NO-API plan generation.
//
// Assembles a COMPLETE, schema-valid MeasurementPlan from a base template
// (templates.ts) with zero Gemini calls. Used as the transparent fallback when
// AI generation fails (transport exhausted or output-quality exhausted) and as a
// manual "generate without AI" path. The result is a generic baseline (not
// site-tailored) and is always flagged meta.source = 'template'.
//
// INVARIANT: this is the ONLY non-Gemini plan ever returned to a user, and it is
// built fresh from the template — never derived from a malformed Gemini output.

import { getTemplate, type TemplateDataLayer, type TemplateEvent } from './templates.ts';
import { finalizePlan } from './generate-plan.ts';
import type {
  BusinessModel,
  Classification,
  ConsentCategory,
  CustomDimension,
  DataLayerVariable,
  EventCategory,
  Kpi,
  MeasurementPlan,
  SiteContext,
  TrackedEvent,
} from './types.ts';

const eventId = (name: string) => `evt_${name}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const TRIGGER_BY_CATEGORY: Record<EventCategory, string> = {
  page: 'On every page load.',
  engagement: 'On the corresponding engagement interaction.',
  ecommerce: 'On the corresponding ecommerce interaction (pushed to the dataLayer).',
  form: 'On successful form submission.',
  conversion: 'When the conversion action completes.',
  custom: 'On the corresponding custom interaction.',
};

// Map a template event → a full TrackedEvent, carrying its parameters and the
// structural triggerType (when the template declares one). Parameter descriptions
// default sensibly when the template leaves them out.
function toTrackedEvent(te: TemplateEvent): TrackedEvent {
  return {
    id: eventId(te.name),
    name: te.name,
    category: te.category,
    description: te.why,
    trigger: TRIGGER_BY_CATEGORY[te.category],
    ...(te.triggerType ? { triggerType: te.triggerType } : {}),
    requiresConsent: te.requiresConsent ?? te.category !== 'page',
    isKeyEvent: te.isKeyEvent,
    parameters: (te.parameters ?? []).map((p) => ({
      name: p.name,
      type: p.type,
      required: p.required,
      description: p.description ?? `${p.name} for the ${te.name} event.`,
      source: p.source,
    })),
  };
}

// A readable example value for an auto-derived dataLayer variable.
function exampleFor(key: string, type: 'string' | 'number' | 'boolean'): string {
  const known: Record<string, string> = {
    value: '129.00', currency: 'USD', transaction_id: 'T_12345', tax: '10.32',
    shipping: '5.00', coupon: 'SUMMER10', method: 'google', plan_tier: 'pro',
    plan: 'monthly', feature_name: 'export_csv', lead_source: 'paid_search',
    payment_type: 'card', listing_id: 'LST_8842', listing_category: 'vehicles',
  };
  if (known[key]) return known[key];
  return type === 'number' ? '1' : type === 'boolean' ? 'true' : 'example';
}

// Build the dataLayer: the rich array/object vars the template declares (e.g.
// `items`), PLUS one variable per appState event parameter — so every value a
// developer must push is documented and every event's params are covered (which
// keeps the deterministic readiness checks green). usedByEventIds always point at
// real events in this plan.
function buildDataLayer(events: TrackedEvent[], explicit: TemplateDataLayer[] | undefined): DataLayerVariable[] {
  const byKey = new Map<string, DataLayerVariable>();

  for (const d of explicit ?? []) {
    const ids = events.filter((e) => d.usedByEvents.includes(e.name)).map((e) => e.id);
    byKey.set(d.key, { key: d.key, type: d.type, description: d.description, example: d.example, usedByEventIds: ids });
  }

  for (const e of events) {
    for (const p of e.parameters) {
      if (p.source !== 'appState' && p.source !== 'dataLayer') continue; // dev-pushed values only
      const existing = byKey.get(p.name);
      if (existing) {
        if (!existing.usedByEventIds.includes(e.id)) existing.usedByEventIds.push(e.id);
      } else {
        byKey.set(p.name, {
          key: p.name,
          type: p.type, // string|number|boolean ⊂ DataLayerVariableType
          description: p.description,
          example: exampleFor(p.name, p.type),
          usedByEventIds: [e.id],
        });
      }
    }
  }

  return Array.from(byKey.values());
}

export function buildPlanFromTemplate(
  businessModel: BusinessModel,
  ctx?: SiteContext,
  now?: string
): MeasurementPlan {
  const template = getTemplate(businessModel);

  const pageView: TrackedEvent = {
    id: eventId('page_view'),
    name: 'page_view',
    category: 'page',
    description: 'Standard GA4 page view on every page.',
    trigger: TRIGGER_BY_CATEGORY.page,
    requiresConsent: false,
    isKeyEvent: false,
    parameters: [],
  };
  const events: TrackedEvent[] = [pageView, ...template.coreEvents.map(toTrackedEvent)];
  const keyEventIds = events.filter((e) => e.isKeyEvent).map((e) => e.id);
  const fallbackLink = events[events.length - 1].id;

  const kpis: Kpi[] = template.coreKpis.map((name) => ({
    id: `kpi_${slug(name)}`,
    name,
    description: `Tracks ${name.toLowerCase()}.`,
    metric: name,
    linkedEventIds: keyEventIds.length ? keyEventIds : [fallbackLink],
  }));

  const dataLayer = buildDataLayer(events, template.dataLayer);
  const customDimensions: CustomDimension[] = template.customDimensions ?? [];

  const categoriesUsed: ConsentCategory[] = ['necessary', 'analytics', 'marketing'];
  const body = {
    kpis,
    events,
    dataLayer,
    consent: {
      categoriesUsed,
      consentModeRequired: true,
      notes: 'Baseline Consent Mode v2 — analytics & marketing tags gated until consent is granted.',
    },
    tooling: {
      ga4: { keyEvents: keyEventIds, customDimensions },
      gtm: {
        suggestedTagCount: events.length,
        notes: `Roughly one GTM tag per event (${events.length}). Template baseline — refine when regenerated with AI.`,
      },
    },
  };

  // A complete Classification for meta stamping (the user/route already chose the
  // business model). finalizePlan validates the body with the SAME guard as the
  // LLM path and stamps source = 'template'.
  const classification: Classification = {
    businessModel,
    vertical: template.vertical,
    primaryKpis: template.coreKpis,
    confidence: 1,
    rationale: 'Template baseline (AI unavailable or no-AI path).',
    signals: [],
  };

  return finalizePlan(body, ctx ?? { mode: 'new', url: '' }, classification, now, 'template');
}
