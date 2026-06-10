import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateMeasurementPlan, validateMeasurementPlan } from './generate-plan.ts';
import { PLAN_SCHEMA_VERSION, type Classification, type SiteContext } from './types.ts';

const CTX: SiteContext = { mode: 'new', url: 'https://shop.example.com' };

const CLASSIFICATION: Classification = {
  businessModel: 'ecommerce',
  vertical: 'retail',
  primaryKpis: ['Conversion rate', 'Revenue'],
  confidence: 0.82,
  rationale: 'test',
  signals: ['cart', 'checkout'],
};

// A structurally valid plan body (no meta — that is stamped server-side).
function goodPlanBody() {
  return {
    kpis: [
      {
        id: 'kpi_revenue',
        name: 'Revenue',
        description: 'Total purchase value.',
        metric: 'sum(value)',
        linkedEventIds: ['evt_purchase'],
      },
    ],
    events: [
      {
        id: 'evt_purchase',
        name: 'purchase',
        category: 'ecommerce',
        description: 'A completed purchase.',
        trigger: 'Order confirmation page load.',
        isKeyEvent: true,
        requiresConsent: true,
        parameters: [
          { name: 'value', type: 'number', required: true, description: 'Order total.', source: 'dataLayer' },
        ],
      },
    ],
    dataLayer: [
      { key: 'value', type: 'number', description: 'Order total.', example: '49.99', usedByEventIds: ['evt_purchase'] },
    ],
    consent: { categoriesUsed: ['analytics'], consentModeRequired: true, notes: '' },
    tooling: {
      ga4: { keyEvents: ['evt_purchase'], customDimensions: [] },
      gtm: { suggestedTagCount: 3, notes: '' },
    },
  };
}

// Wrap a plan body in a Gemini generateContent response envelope.
function geminiResponse(bodyJson: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: bodyJson }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
    text: async () => bodyJson,
  };
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── validator: rejects bad shapes ───

test('validateMeasurementPlan rejects a non-snake_case event name', () => {
  const bad = goodPlanBody();
  bad.events[0].name = 'AddToCart';
  assert.throws(() => validateMeasurementPlan(bad), /snake_case/);
});

test('validateMeasurementPlan rejects a missing/empty events array', () => {
  const bad = goodPlanBody() as Record<string, unknown>;
  bad.events = [];
  assert.throws(() => validateMeasurementPlan(bad), /non-empty array/);
});

test('validateMeasurementPlan rejects missing consent/tooling', () => {
  const noConsent = goodPlanBody() as Record<string, unknown>;
  delete noConsent.consent;
  assert.throws(() => validateMeasurementPlan(noConsent), /consent/);

  const noTooling = goodPlanBody() as Record<string, unknown>;
  delete noTooling.tooling;
  assert.throws(() => validateMeasurementPlan(noTooling), /tooling/);
});

test('validateMeasurementPlan accepts a good plan body', () => {
  assert.doesNotThrow(() => validateMeasurementPlan(goodPlanBody()));
});

// ─── generateMeasurementPlan: end-to-end with mocked Gemini fetch ───

test('generateMeasurementPlan parses, validates, and stamps meta', async () => {
  globalThis.fetch = (async () =>
    geminiResponse(JSON.stringify(goodPlanBody()))) as unknown as typeof fetch;

  const plan = await generateMeasurementPlan(CTX, CLASSIFICATION);

  assert.equal(plan.events[0].name, 'purchase');
  // meta is authoritative / server-stamped, never trusted from the model.
  assert.equal(plan.meta.url, CTX.url);
  assert.equal(plan.meta.businessModel, 'ecommerce');
  assert.equal(plan.meta.vertical, 'retail');
  assert.equal(plan.meta.schemaVersion, PLAN_SCHEMA_VERSION);
  assert.equal(plan.meta.classificationConfidence, 0.82);
  assert.ok(!Number.isNaN(Date.parse(plan.meta.generatedAt)), 'generatedAt is an ISO timestamp');
});

test('generateMeasurementPlan throws when the model returns a bad shape', async () => {
  const bad = goodPlanBody();
  bad.events[0].name = 'Bad Name';
  globalThis.fetch = (async () =>
    geminiResponse(JSON.stringify(bad))) as unknown as typeof fetch;

  await assert.rejects(() => generateMeasurementPlan(CTX, CLASSIFICATION), /snake_case/);
});
