// CREATE → INJECT wiring: the new (or existing) container id flows into the inject
// step automatically; a manually typed id is preserved and wins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInjectContainerId } from './inject-link.ts';

test('a just-created container id flows into the inject step', () => {
  assert.equal(resolveInjectContainerId({ createdId: 'GTM-NEW123' }), 'GTM-NEW123');
});

test('an already-existing container id flows the same way', () => {
  assert.equal(resolveInjectContainerId({ existingId: 'GTM-OLD999' }), 'GTM-OLD999');
});

test('a manually typed id is preserved (independent use) and wins over auto-fill', () => {
  assert.equal(resolveInjectContainerId({ typed: 'GTM-MANUAL' }), 'GTM-MANUAL');
  assert.equal(resolveInjectContainerId({ typed: 'GTM-MANUAL', createdId: 'GTM-NEW', existingId: 'GTM-OLD' }), 'GTM-MANUAL');
});

test('precedence: created beats existing beats fallback', () => {
  assert.equal(resolveInjectContainerId({ createdId: 'GTM-C', existingId: 'GTM-E', fallback: 'GTM-F' }), 'GTM-C');
  assert.equal(resolveInjectContainerId({ existingId: 'GTM-E', fallback: 'GTM-F' }), 'GTM-E');
  assert.equal(resolveInjectContainerId({ fallback: 'GTM-F' }), 'GTM-F');
});

test('nothing (or only whitespace) available → empty string', () => {
  assert.equal(resolveInjectContainerId({}), '');
  assert.equal(resolveInjectContainerId({ typed: '   ' }), '');
});
