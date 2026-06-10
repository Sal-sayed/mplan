import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runNewSitePipeline, LowConfidenceError } from './pipeline.ts';
import type { SiteContext } from './types.ts';

// A context with no business-model signals → confidence 0.
const BLANK_CTX: SiteContext = { mode: 'new', url: '', brief: 'hello world' };

function goodPlanBody() {
  return {
    kpis: [{ id: 'k1', name: 'Leads', description: '', metric: 'count', linkedEventIds: ['e1'] }],
    events: [
      {
        id: 'e1',
        name: 'generate_lead',
        category: 'conversion',
        description: '',
        trigger: '',
        isKeyEvent: true,
        requiresConsent: true,
        parameters: [],
      },
    ],
    dataLayer: [],
    consent: { categoriesUsed: ['analytics'], consentModeRequired: true, notes: '' },
    tooling: { ga4: { keyEvents: ['e1'], customDimensions: [] }, gtm: { suggestedTagCount: 1, notes: '' } },
  };
}

function mockGemini(bodyJson: string) {
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: bodyJson }] } }],
      usageMetadata: {},
    }),
    text: async () => bodyJson,
  })) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('low confidence throws LowConfidenceError when requireConfidentClassification', async () => {
  await assert.rejects(
    () => runNewSitePipeline(BLANK_CTX, { requireConfidentClassification: true }),
    (err: unknown) => {
      assert.ok(err instanceof LowConfidenceError, 'is a LowConfidenceError');
      assert.equal(err.classification.confidence, 0);
      assert.equal(err.classification.businessModel, 'lead_gen');
      return true;
    }
  );
});

test('overrideClassification bypasses the guess and the low-confidence gate', async () => {
  mockGemini(JSON.stringify(goodPlanBody()));

  const result = await runNewSitePipeline(BLANK_CTX, {
    requireConfidentClassification: true, // would otherwise throw on this blank ctx
    overrideClassification: 'ecommerce',
  });

  assert.equal(result.classification.businessModel, 'ecommerce');
  assert.equal(result.classification.confidence, 1);
  assert.equal(result.plan.meta.businessModel, 'ecommerce');
  assert.equal(result.plan.events[0].name, 'generate_lead');
});

test('without the gate, a low-confidence context still produces a plan', async () => {
  mockGemini(JSON.stringify(goodPlanBody()));

  const result = await runNewSitePipeline(BLANK_CTX);
  assert.equal(result.classification.businessModel, 'lead_gen');
  assert.ok(result.plan.meta.generatedAt);
});
