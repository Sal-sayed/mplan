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

import { getTemplate, type TemplateEvent } from './templates.ts';
import { finalizePlan } from './generate-plan.ts';
import type {
  BusinessModel,
  Classification,
  ConsentCategory,
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

// Template events carry no parameters — a baseline; the AI path adds tailored
// parameters/dataLayer when regenerated. Empty params keep the plan valid and
// the deterministic launch-readiness checks green.
function toTrackedEvent(te: TemplateEvent): TrackedEvent {
  return {
    id: eventId(te.name),
    name: te.name,
    category: te.category,
    description: te.why,
    trigger: TRIGGER_BY_CATEGORY[te.category],
    requiresConsent: te.category !== 'page',
    isKeyEvent: te.isKeyEvent,
    parameters: [],
  };
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

  const categoriesUsed: ConsentCategory[] = ['necessary', 'analytics', 'marketing'];
  const body = {
    kpis,
    events,
    dataLayer: [],
    consent: {
      categoriesUsed,
      consentModeRequired: true,
      notes: 'Baseline Consent Mode v2 — analytics & marketing tags gated until consent is granted.',
    },
    tooling: {
      ga4: { keyEvents: keyEventIds, customDimensions: [] },
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
