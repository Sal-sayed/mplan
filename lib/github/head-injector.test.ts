// head-injector: confident stacks inject before/after the right tags; an existing
// GTM snippet is a no-op; an unrecognized structure refuses to guess (paste fallback,
// NO injection). Pure functions — no mocks needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeadInjection, buildGtmSnippet } from './head-injector.ts';

const GTM = 'GTM-ABC1234';

const plainHtml =
  '<!doctype html><html><head><title>Shop</title></head><body><h1>Hi</h1></body></html>';

test('plain static HTML (index.html) → injects the loader inside <head> and noscript after <body>', () => {
  const r = resolveHeadInjection([{ path: 'index.html', content: plainHtml }], GTM);
  assert.equal(r.status, 'inject');
  if (r.status !== 'inject') return;
  assert.equal(r.filePath, 'index.html');
  // The container id is present, and the loader sits after <head>, before </head>.
  assert.ok(r.newContent.includes(GTM), 'snippet contains the container id');
  assert.ok(/<head[^>]*>\s*<!-- Google Tag Manager -->/.test(r.newContent), 'loader is right after <head>');
  assert.ok(r.newContent.indexOf('gtm.js?id=') < r.newContent.indexOf('</head>'), 'loader is before </head>');
  assert.ok(/<body[^>]*>\s*<!-- Google Tag Manager \(noscript\) -->/.test(r.newContent), 'noscript is right after <body>');
  assert.ok(r.newContent.includes('ns.html?id=' + GTM), 'noscript iframe references the container');
});

test('React/Vite (public/index.html) → same confident injection', () => {
  const r = resolveHeadInjection(
    [{ path: 'public/index.html', content: '<html><head></head><body></body></html>' }],
    GTM
  );
  assert.equal(r.status, 'inject');
  if (r.status !== 'inject') return;
  assert.equal(r.filePath, 'public/index.html');
  assert.ok(r.newContent.includes(GTM));
});

test('snippet already present → no-op "already_installed", no new content', () => {
  // First inject, then feed the result back in — it must detect the existing snippet.
  const first = resolveHeadInjection([{ path: 'index.html', content: plainHtml }], GTM);
  assert.equal(first.status, 'inject');
  if (first.status !== 'inject') return;
  const second = resolveHeadInjection([{ path: 'index.html', content: first.newContent }], GTM);
  assert.equal(second.status, 'already_installed');
});

test('an existing DIFFERENT GTM loader is also treated as already_installed (no double loader)', () => {
  const withOther = '<html><head>' + buildGtmSnippet('GTM-OTHER99').head + '</head><body></body></html>';
  const r = resolveHeadInjection([{ path: 'index.html', content: withOther }], GTM);
  assert.equal(r.status, 'already_installed');
});

test('unrecognized structure (no <head> in any confident file) → not_confident + paste snippet, NO injection', () => {
  // A file that is NOT on the confident allowlist, plus a confident file with no <head>.
  const r = resolveHeadInjection(
    [
      { path: 'src/App.tsx', content: 'export default function App(){return null}' },
      { path: 'index.html', content: '<html><body>no head here</body></html>' },
    ],
    GTM
  );
  assert.equal(r.status, 'not_confident');
  if (r.status !== 'not_confident') return;
  assert.ok(r.pasteSnippet.includes(GTM), 'paste fallback still contains the container id');
  assert.ok(r.pasteSnippet.includes('<head>') && r.pasteSnippet.includes('<body>'), 'paste guidance covers both halves');
});

test('no candidate files at all → not_confident, never guesses', () => {
  const r = resolveHeadInjection([], GTM);
  assert.equal(r.status, 'not_confident');
});

test('a non-allowlisted html file with a <head> is NOT injected (only the confident allowlist)', () => {
  const r = resolveHeadInjection([{ path: 'docs/about.html', content: plainHtml }], GTM);
  assert.equal(r.status, 'not_confident', 'arbitrary html is not a confident entry point');
});
