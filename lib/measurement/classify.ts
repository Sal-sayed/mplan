// classify.ts — deterministic business-model classification (no LLM).
//
// Scores lowercased signal substrings against the site context (page paths,
// titles, form text, brief, detected stack). Fully pure and unit-testable so
// the classification can be reasoned about and reproduced without a model call.

import type { BusinessModel, Classification, SiteContext } from './types.ts';
import { getTemplate } from './templates.ts';

// Minimum confidence below which a caller may want explicit user confirmation
// before trusting the guess.
export const LOW_CONFIDENCE = 0.4;

// Fixed iteration order — also the tie-break order (first max wins).
const MODELS: BusinessModel[] = [
  'ecommerce',
  'saas',
  'lead_gen',
  'media_content',
  'marketplace',
];

// Signal substrings per model. Matched case-insensitively against the corpus.
const SIGNALS: Record<BusinessModel, string[]> = {
  ecommerce: ['cart', 'checkout', 'add to cart', '/product', '/shop', 'buy now', 'add_to_cart'],
  saas: ['pricing', 'free trial', 'start trial', 'sign up', 'signup', '/dashboard', '/app', 'subscription plan'],
  lead_gen: ['contact', 'demo', 'request a quote', 'get a quote', 'book a call', 'consultation'],
  media_content: ['/article', '/blog', 'newsletter', 'subscribe', 'read more', '/news', 'editorial'],
  marketplace: ['listing', 'listings', 'sellers', 'seller', 'marketplace', 'post an ad', 'browse listings'],
};

// Number of total signal hits at which we trust the share fully. Below this we
// damp confidence proportionally so a single stray keyword can't read as 100%.
const FULL_EVIDENCE_HITS = 4;

// Build one lowercased searchable corpus from every textual part of the context.
function buildCorpus(ctx: SiteContext): string {
  const parts: string[] = [];
  if (ctx.url) parts.push(ctx.url);
  if (ctx.brief) parts.push(ctx.brief);
  for (const p of ctx.pages ?? []) {
    parts.push(p.path);
    if (p.title) parts.push(p.title);
  }
  for (const f of ctx.forms ?? []) {
    if (f.action) parts.push(f.action);
    if (f.purpose) parts.push(f.purpose);
    parts.push(...f.fields);
  }
  parts.push(...(ctx.detectedStack ?? []));
  return parts.join(' \n ').toLowerCase();
}

// Count occurrences of `needle` in `haystack` (non-overlapping).
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export function classifySite(ctx: SiteContext): Classification {
  const corpus = buildCorpus(ctx);

  const scores: Record<BusinessModel, number> = {
    ecommerce: 0,
    saas: 0,
    lead_gen: 0,
    media_content: 0,
    marketplace: 0,
  };
  const matchedByModel: Record<BusinessModel, string[]> = {
    ecommerce: [],
    saas: [],
    lead_gen: [],
    media_content: [],
    marketplace: [],
  };

  let totalHits = 0;
  for (const model of MODELS) {
    for (const signal of SIGNALS[model]) {
      const hits = countOccurrences(corpus, signal);
      if (hits > 0) {
        scores[model] += hits;
        totalHits += hits;
        matchedByModel[model].push(signal);
      }
    }
  }

  // No evidence at all → safe default, zero confidence.
  if (totalHits === 0) {
    const fallback = getTemplate('lead_gen');
    return {
      businessModel: 'lead_gen',
      vertical: fallback.vertical,
      primaryKpis: fallback.coreKpis,
      confidence: 0,
      rationale: 'No business-model signals detected in the provided context; defaulting to lead_gen.',
      signals: [],
    };
  }

  // Winner = highest score, ties broken by MODELS order.
  let winner: BusinessModel = MODELS[0];
  for (const model of MODELS) {
    if (scores[model] > scores[winner]) winner = model;
  }

  const share = scores[winner] / totalHits;
  const evidenceFactor = Math.min(1, totalHits / FULL_EVIDENCE_HITS);
  const confidence = Math.max(0, Math.min(1, share * evidenceFactor));

  const template = getTemplate(winner);
  const signals = matchedByModel[winner];
  const rationale =
    `Matched ${scores[winner]} of ${totalHits} signals for ${winner} ` +
    `(${signals.join(', ')}); share ${share.toFixed(2)} damped to ${confidence.toFixed(2)} by evidence volume.`;

  return {
    businessModel: winner,
    vertical: template.vertical,
    primaryKpis: template.coreKpis,
    confidence,
    rationale,
    signals,
  };
}
