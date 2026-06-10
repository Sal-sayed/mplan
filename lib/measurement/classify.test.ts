import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySite, LOW_CONFIDENCE } from './classify.ts';
import type { SiteContext } from './types.ts';

function ctx(partial: Partial<SiteContext>): SiteContext {
  return { mode: 'new', url: 'https://example.com', ...partial };
}

// Table-driven fixtures — each clearly points at one business model.
const FIXTURES: Array<{ name: string; ctx: SiteContext; expect: string }> = [
  {
    name: 'ecommerce — cart/checkout/product',
    ctx: ctx({
      pages: [{ path: '/product/widget' }, { path: '/cart' }, { path: '/checkout' }],
      forms: [{ action: '/checkout', fields: ['email'], purpose: 'checkout' }],
    }),
    expect: 'ecommerce',
  },
  {
    name: 'saas — pricing/free trial/signup',
    ctx: ctx({
      pages: [{ path: '/pricing' }, { path: '/signup', title: 'Start your free trial' }, { path: '/dashboard' }],
      brief: 'A subscription plan SaaS tool.',
    }),
    expect: 'saas',
  },
  {
    name: 'lead_gen — contact/demo/quote',
    ctx: ctx({
      pages: [{ path: '/contact' }, { path: '/demo' }],
      forms: [{ action: '/contact', fields: ['name', 'email'], purpose: 'request a quote' }],
    }),
    expect: 'lead_gen',
  },
  {
    name: 'media_content — article/blog/newsletter',
    ctx: ctx({
      pages: [{ path: '/article/how-to' }, { path: '/blog' }],
      brief: 'Editorial site with a newsletter and subscribe options.',
    }),
    expect: 'media_content',
  },
  {
    name: 'marketplace — listings/sellers',
    ctx: ctx({
      pages: [{ path: '/listings' }, { path: '/sellers' }],
      brief: 'A marketplace to browse listings from sellers.',
    }),
    expect: 'marketplace',
  },
];

for (const f of FIXTURES) {
  test(`classifySite: ${f.name}`, () => {
    const result = classifySite(f.ctx);
    assert.equal(result.businessModel, f.expect);
    assert.ok(result.confidence > 0, 'should have positive confidence with signals');
    assert.ok(result.confidence <= 1, 'confidence is bounded at 1');
    assert.ok(result.signals.length > 0, 'should report matched signals');
    assert.ok(result.primaryKpis.length > 0, 'should carry template KPIs');
  });
}

test('classifySite: empty context defaults to lead_gen at confidence 0', () => {
  const result = classifySite(ctx({ url: '' }));
  assert.equal(result.businessModel, 'lead_gen');
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.signals, []);
});

test('classifySite: a single stray signal stays below LOW_CONFIDENCE (damped)', () => {
  const result = classifySite(ctx({ url: '', pages: [{ path: '/cart' }] }));
  assert.equal(result.businessModel, 'ecommerce');
  assert.ok(
    result.confidence < LOW_CONFIDENCE,
    `expected damped confidence < ${LOW_CONFIDENCE}, got ${result.confidence}`
  );
});
