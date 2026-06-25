// suggestLocations: best-effort file suggestion per rich event. Only ever names a
// REAL file from the provided tree (never fabricated), with a verify-first hint;
// returns null when there's no confident match.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestLocations } from './datalayer-locator.ts';

const tree = [
  'src/components/ContactForm.tsx',
  'src/components/Hero.tsx',
  'src/components/Header.tsx',
  'src/pages/Checkout.tsx',
  'README.md',
  'package.json',
  'node_modules/some-dep/index.js',
  'dist/bundle.js',
  'src/components/ContactForm.test.tsx',
];

test('contact / generate_lead → suggests the ContactForm component (a real path)', async () => {
  const [s] = await suggestLocations({ events: [{ name: 'generate_lead', category: 'form' }], repoTree: tree });
  assert.equal(s.suggestedFile, 'src/components/ContactForm.tsx');
  assert.ok(tree.includes(s.suggestedFile!));
  assert.equal(s.confidence, 'medium');
  assert.match(s.locationHint, /place the push/i);
});

test('a finer handler hint is added when the candidate file has a submit handler', async () => {
  const readFile = async (p: string) => (p === 'src/components/ContactForm.tsx' ? 'function handleSubmit(e){ e.preventDefault(); }' : null);
  const [s] = await suggestLocations({ events: [{ name: 'contact' }], repoTree: tree, readFile });
  assert.match(s.locationHint, /handleSubmit/);
});

test('a promo event → suggests a Hero/Promo file', async () => {
  const [s] = await suggestLocations({ events: [{ name: 'view_promotion' }], repoTree: tree });
  assert.equal(s.suggestedFile, 'src/components/Hero.tsx');
});

test('no matching file → suggestedFile null + generic hint, never a fabricated path', async () => {
  const [s] = await suggestLocations({ events: [{ name: 'wishlist_add' }], repoTree: ['src/components/Header.tsx', 'README.md'] });
  assert.equal(s.suggestedFile, null);
  assert.match(s.locationHint, /couldn't find a confident match/i);
  assert.equal(s.alternatives.length, 0);
});

test('NEVER fabricates: every suggestedFile (and alternative) exists in the provided tree', async () => {
  const events = [{ name: 'generate_lead' }, { name: 'view_promotion' }, { name: 'purchase' }, { name: 'random_thing' }];
  const res = await suggestLocations({ events, repoTree: tree });
  for (const s of res) {
    if (s.suggestedFile !== null) assert.ok(tree.includes(s.suggestedFile), `${s.suggestedFile} must be a real tree path`);
    for (const a of s.alternatives) assert.ok(tree.includes(a), `${a} must be a real tree path`);
  }
});

test('excludes node_modules / dist / test files from candidates', async () => {
  const t = ['node_modules/contact-form/index.js', 'dist/contact.js', 'src/components/ContactForm.test.tsx', 'src/components/ContactForm.tsx'];
  const [s] = await suggestLocations({ events: [{ name: 'contact' }], repoTree: t });
  assert.equal(s.suggestedFile, 'src/components/ContactForm.tsx', 'picks the real component, not the dep/dist/test file');
});
