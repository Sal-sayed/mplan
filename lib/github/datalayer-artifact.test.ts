// The assistive dataLayer artifact builder: one reference file with, per event, the
// dataLayer.push snippet + a "fires when" + a TODO/verify placement instruction, and
// a header. Pure — built from the real implementation-proposal output.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDataLayerArtifact, DATALAYER_ARTIFACT_PATH } from './datalayer-artifact.ts';
import { buildImplementationProposal } from '../measurement/implementation-proposal.ts';
import type { MeasurementPlan } from '../measurement/types.ts';

function plan(): MeasurementPlan {
  return {
    meta: { url: 'https://shop.example.com', businessModel: 'ecommerce', vertical: 'retail', generatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: '1.0.0', classificationConfidence: 0.9 },
    kpis: [],
    events: [
      { id: 'evt_pv', name: 'page_view', category: 'page', description: 'Page views', trigger: '', isKeyEvent: false, requiresConsent: false, parameters: [] },
      { id: 'evt_lead', name: 'generate_lead', category: 'form', description: 'Contact form submissions', trigger: '', isKeyEvent: true, requiresConsent: false, parameters: [{ name: 'form_id', type: 'string', required: true, description: '', source: 'dataLayer' }] },
      { id: 'evt_purchase', name: 'purchase', category: 'ecommerce', description: 'Orders', trigger: '', isKeyEvent: true, requiresConsent: true, parameters: [{ name: 'value', type: 'number', required: true, description: '', source: 'dataLayer' }] },
    ],
    dataLayer: [
      { key: 'form_id', type: 'string', description: '', example: 'contact', usedByEventIds: ['evt_lead'] },
      { key: 'value', type: 'number', description: '', example: '49.99', usedByEventIds: ['evt_purchase'] },
    ],
    consent: { categoriesUsed: ['necessary', 'analytics'], consentModeRequired: false, notes: '' },
    tooling: { ga4: { keyEvents: ['evt_lead', 'evt_purchase'], customDimensions: [] }, gtm: { suggestedTagCount: 3, notes: '' } },
  };
}

const build = () => buildDataLayerArtifact(buildImplementationProposal(plan()).items);

test('path is the markdown reference file (documentation, not executable code)', () => {
  assert.equal(DATALAYER_ARTIFACT_PATH, 'ANALYTICS-DATALAYER.md');
  assert.equal(build().path, 'ANALYTICS-DATALAYER.md');
});

test('header makes clear it is reference-only and not auto-wired', () => {
  const { contents } = build();
  assert.match(contents, /Place each one in the matching action handler/i);
  assert.match(contents, /does not wire them up automatically/i);
});

test('one dataLayer.push snippet per event, and eventCount matches', () => {
  const art = build();
  assert.equal(art.eventCount, 3);
  const pushes = art.contents.match(/dataLayer\.push\(/g) || [];
  assert.equal(pushes.length, 3, 'exactly N push snippets');
});

test('each event has its name, a "fires when", and a TODO/verify placement instruction', () => {
  const { contents } = build();
  for (const name of ['page_view', 'generate_lead', 'purchase']) {
    assert.ok(contents.includes(name), `${name} present`);
  }
  // One "Fires when" + one "TODO" + a verify instruction per event (3 events).
  assert.equal((contents.match(/\*\*Fires when:\*\*/g) || []).length, 3);
  assert.equal((contents.match(/\*\*TODO:\*\*/g) || []).length, 3);
  assert.match(contents, /verify/i);
});

test('form events tell the developer to place AFTER validation (never auto-located)', () => {
  const { contents } = build();
  assert.match(contents, /submit handler, AFTER validation/i);
});

test('the snippet contains the real push code (event + params) from the plan', () => {
  const { contents } = build();
  assert.match(contents, /'event': 'purchase'/);
  assert.match(contents, /'value':/);
});
