// generate-plan.ts — stage 3: Gemini fills the measurement-plan schema.
//
// The prompt is grounded on the model's base template + the site context so the
// LLM tailors a proven plan rather than inventing one. Output is parsed with the
// repo's existing loose JSON parser, validated by a hand-rolled runtime guard,
// and then meta is stamped server-side (we never trust the model for meta).
//
// Exports the stages individually (buildPlanPrompt / validateMeasurementPlan /
// finalizePlan) so the streaming route can reuse them as post-processing while
// the non-streaming pipeline and tests use generateMeasurementPlan().

import { geminiGenerate, getGeminiModel } from '../gemini.ts';
import { parseJsonLoose } from '../json-repair.ts';
import { getTemplate } from './templates.ts';
import {
  PLAN_SCHEMA_VERSION,
  type Classification,
  type MeasurementPlan,
  type SiteContext,
} from './types.ts';

const GA4_EVENT_NAME = /^[a-z0-9_]+$/;

// Generous ceiling — the schema is large but bounded.
const MAX_OUTPUT_TOKENS = 16000;

// ─── Prompt ───

export function buildPlanPrompt(
  ctx: SiteContext,
  classification: Classification
): { system: string; user: string } {
  const template = getTemplate(classification.businessModel);

  const system = [
    'You are a senior digital-analytics consultant producing a Google Analytics 4 + Google Tag Manager measurement plan for a PRE-LAUNCH website.',
    'You are given a proven base template for the business model. TAILOR it to the specific site — keep the standard GA4 events, add site-specific events/parameters where justified, and drop nothing essential.',
    'All event names MUST be GA4 snake_case (lowercase letters, digits, underscores only).',
    'Return ONLY a single JSON object that matches the requested schema. No markdown, no prose, no code fences.',
    '',
    'JSON schema (TypeScript shape):',
    '{',
    '  "kpis": [{ "id": string, "name": string, "description": string, "metric": string, "linkedEventIds": string[] }],',
    '  "events": [{ "id": string, "name": string /*snake_case*/, "category": "page"|"engagement"|"ecommerce"|"form"|"conversion"|"custom", "description": string, "trigger": string, "isKeyEvent": boolean, "requiresConsent": boolean, "parameters": [{ "name": string, "type": "string"|"number"|"boolean", "required": boolean, "description": string, "source": "dataLayer"|"gtm"|"page" }] }],',
    '  "dataLayer": [{ "key": string, "type": "string"|"number"|"boolean"|"object"|"array", "description": string, "example": string, "usedByEventIds": string[] }],',
    '  "consent": { "categoriesUsed": ("necessary"|"analytics"|"marketing"|"preferences")[], "consentModeRequired": boolean, "notes": string },',
    '  "tooling": { "ga4": { "keyEvents": string[], "customDimensions": [{ "name": string, "scope": "event"|"user", "parameter": string }] }, "gtm": { "suggestedTagCount": number, "notes": string } }',
    '}',
    'Do NOT include a "meta" field — it is added server-side.',
    'Event ids referenced by kpis.linkedEventIds, dataLayer.usedByEventIds, and tooling.ga4.keyEvents MUST match an event id you define.',
  ].join('\n');

  const user = [
    `Business model: ${classification.businessModel} (vertical: ${classification.vertical}, confidence: ${classification.confidence.toFixed(2)})`,
    `Classification rationale: ${classification.rationale}`,
    `Primary KPIs to cover: ${classification.primaryKpis.join(', ')}`,
    '',
    'Base template to tailor:',
    `  Core KPIs: ${template.coreKpis.join(', ')}`,
    '  Core events:',
    ...template.coreEvents.map(
      (e) => `    - ${e.name} [${e.category}${e.isKeyEvent ? ', key event' : ''}]: ${e.why}`
    ),
    '',
    'Site context:',
    `  URL: ${ctx.url}`,
    ctx.brief ? `  Brief: ${ctx.brief}` : '  Brief: (none provided)',
    ctx.detectedStack?.length ? `  Detected stack: ${ctx.detectedStack.join(', ')}` : '',
    ctx.pages?.length
      ? `  Pages:\n${ctx.pages.map((p) => `    - ${p.path}${p.title ? ` (${p.title})` : ''}`).join('\n')}`
      : '  Pages: (none provided)',
    ctx.forms?.length
      ? `  Forms:\n${ctx.forms
          .map((f) => `    - ${f.action ?? '(no action)'} fields=[${f.fields.join(', ')}]${f.purpose ? ` purpose=${f.purpose}` : ''}`)
          .join('\n')}`
      : '  Forms: (none provided)',
    '',
    'Produce the tailored measurement plan as a single JSON object now.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

// ─── Validation (hand-rolled runtime guard — no validation library) ───

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Throws a clear Error if `raw` is not a structurally valid plan body. Does NOT
// check `meta` — meta is stamped server-side. Returns nothing; narrowing is by
// convention (finalizePlan casts after this passes).
export function validateMeasurementPlan(raw: unknown): void {
  if (!isObject(raw)) throw new Error('Plan is not a JSON object.');

  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    throw new Error('Plan.events must be a non-empty array.');
  }
  raw.events.forEach((ev, i) => {
    if (!isObject(ev)) throw new Error(`Plan.events[${i}] is not an object.`);
    if (typeof ev.name !== 'string' || !GA4_EVENT_NAME.test(ev.name)) {
      throw new Error(`Plan.events[${i}].name "${String(ev.name)}" is not GA4 snake_case (/^[a-z0-9_]+$/).`);
    }
    if (!Array.isArray(ev.parameters)) {
      throw new Error(`Plan.events[${i}] (${ev.name}) is missing a parameters array.`);
    }
  });

  if (!Array.isArray(raw.kpis)) throw new Error('Plan.kpis must be an array.');
  if (!Array.isArray(raw.dataLayer)) throw new Error('Plan.dataLayer must be an array.');

  if (!isObject(raw.consent) || !Array.isArray(raw.consent.categoriesUsed)) {
    throw new Error('Plan.consent must be present with a categoriesUsed array.');
  }

  if (!isObject(raw.tooling) || !isObject(raw.tooling.ga4) || !isObject(raw.tooling.gtm)) {
    throw new Error('Plan.tooling must be present with ga4 and gtm sections.');
  }
}

// ─── Finalize: validate + stamp authoritative meta ───

export function finalizePlan(
  raw: unknown,
  ctx: SiteContext,
  classification: Classification,
  now: string = new Date().toISOString()
): MeasurementPlan {
  validateMeasurementPlan(raw);
  const body = raw as Omit<MeasurementPlan, 'meta'>;
  return {
    ...body,
    meta: {
      url: ctx.url,
      businessModel: classification.businessModel,
      vertical: classification.vertical,
      generatedAt: now,
      schemaVersion: PLAN_SCHEMA_VERSION,
      classificationConfidence: classification.confidence,
    },
  };
}

// ─── Non-streaming generation (pipeline + tests) ───

export async function generateMeasurementPlan(
  ctx: SiteContext,
  classification: Classification
): Promise<MeasurementPlan> {
  const { system, user } = buildPlanPrompt(ctx, classification);

  const { text } = await geminiGenerate({
    model: getGeminiModel(),
    system,
    userMessage: user,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    json: true, // -> generationConfig.responseMimeType = "application/json"
    thinkingBudget: 0, // structured JSON task; disable thinking for speed/cost
  });

  const parsed = parseJsonLoose(text);
  return finalizePlan(parsed, ctx, classification);
}
