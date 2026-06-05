/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Universal event-equivalence engine.
 *
 * Decides whether a "candidate missing event" (e.g. the GA4 standard
 * `add_to_cart`) is *functionally* already tracked by any custom-named event
 * already firing on the site (e.g. `event_buy_now`).
 *
 * Three layered rules, cheap → expensive:
 *   1) Normalization match — strip prefixes/suffixes, compare canonical forms
 *   2) Keyword intent match — does the candidate share an intent word with
 *      any detected event after normalization?
 *   3) AI fallback — ask the model only when the cheap rules disagree
 *
 * Results are cached per-process so the second invocation with the same
 * candidate against the same detected set is free. The cache self-trims to
 * keep memory bounded.
 */

import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

export type CoverageMethod = 'no-events' | 'normalized-match' | 'keyword-match' | 'ai-check' | 'no-match';

export interface CoverageResult {
  isCovered: boolean;
  coveredByEvent: string | null;
  method: CoverageMethod;
  reasoning: string;
}

// ─── INTENT KEYWORDS PER STANDARD GA4 EVENT ─────
// Keyed by the canonical/standard GA4 event name. Each value is a list of
// fragments that — if present anywhere inside a detected (normalized) event
// name — signal the same user intent. Add new standards here when new domains
// appear; the rest of the engine adapts.
const EVENT_INTENT_KEYWORDS: Record<string, string[]> = {
  // ─── E-COMMERCE ───
  view_item:           ['product_detail', 'product_view', 'view_product', 'pdp', 'view_more_details', 'product_page', 'item_detail', 'view_details', 'detail_view'],
  view_item_list:      ['product_list', 'view_list', 'category_view', 'view_category', 'view_collection', 'view_grid', 'list_view', 'browse_products', 'plp', 'category_page'],
  select_item:         ['product_click', 'select_product', 'click_product', 'tap_product', 'item_click', 'product_select', 'product_card_click', 'product_card_tap'],
  view_promotion:      ['promo_view', 'banner_view', 'promotion_view', 'promo_impression', 'banner_impression', 'hero_view'],
  select_promotion:    ['promo_click', 'banner_click', 'promotion_click', 'promo_select', 'hero_click', 'banner_tap'],
  add_to_cart:         ['buy_now', 'add_to_bag', 'add_to_basket', 'add_cart', 'cart_add', 'purchase_now', 'shop_now', 'addtocart', 'addtobag', 'add_item_to_cart'],
  remove_from_cart:    ['remove_cart', 'cart_remove', 'remove_item', 'remove_from_bag', 'delete_item', 'cart_delete'],
  view_cart:           ['view_cart', 'view_bag', 'view_basket', 'open_cart', 'cart_view', 'bag_view', 'cart_open'],
  begin_checkout:      ['start_checkout', 'proceed_checkout', 'checkout_start', 'go_to_checkout', 'checkout_init', 'begin_purchase'],
  add_payment_info:    ['payment_info', 'payment_method', 'add_payment', 'select_payment', 'payment_select'],
  add_shipping_info:   ['shipping_info', 'shipping_method', 'delivery_info', 'address_submit', 'shipping_select', 'delivery_method'],
  purchase:            ['order_complete', 'transaction', 'order_placed', 'checkout_complete', 'buy_complete', 'order_success', 'purchase_complete'],
  refund:              ['refund', 'return', 'cancel_order', 'order_cancelled'],
  add_to_wishlist:     ['wishlist', 'save_for_later', 'favourite', 'favorite', 'add_to_favorites', 'heart'],

  // ─── SEARCH ───
  search:              ['site_search', 'query_submit', 'search_submit', 'search_query', 'search_perform'],
  view_search_results: ['search_results', 'view_search', 'results_shown', 'search_view'],

  // ─── ENGAGEMENT / ACCOUNT ───
  share:               ['socialmedia_exit', 'social_share', 'share_click', 'tweet', 'facebook_share', 'whatsapp_share'],
  sign_up:             ['register', 'create_account', 'join_now', 'signup', 'account_create', 'registration_complete'],
  login:               ['sign_in', 'user_login', 'auth', 'login_success', 'signin'],
  newsletter_signup:   ['newsletter', 'email_signup', 'subscribe_now', 'email_subscribe'],
  generate_lead:       ['lead', 'contact_form', 'request_quote', 'submit_inquiry', 'lead_capture', 'demo_request'],
  form_start:          ['form_begin', 'start_form', 'form_focus'],
  form_submit:         ['submit_form', 'form_complete', 'form_submission'],

  // ─── MEDIA / CONTENT ───
  video_start:         ['video_play', 'play_video', 'video_started', 'media_play'],
  video_progress:      ['video_25', 'video_50', 'video_75', 'video_milestone'],
  video_complete:      ['video_end', 'video_finish', 'video_completed', 'media_complete'],
  file_download:       ['download', 'pdf_download', 'file_get', 'asset_download'],

  // ─── CLICK / NAVIGATION ───
  click:               ['button_click', 'cta_click', 'link_click', 'tap'],
  outbound_click:      ['outbound', 'external_link', 'external_click', 'exit_link', 'outbound_link'],

  // ─── BEHAVIOUR ───
  scroll:              ['scroll_depth', 'page_scroll', 'scroll_milestone'],
};

// ─── RULE 1: NORMALIZATION ─────
/**
 * Strip common analytics-naming wrappers and punctuation so we can compare
 * the "core" intent of two event names. Keep the result lowercase, snake_case.
 */
export function normalizeEventName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    // Common prefixes
    .replace(/^(event[_-]|ga[_-]event[_-]|gtm[_-]event[_-]|track[_-]|on[_-]|ev[_-])/i, '')
    // Common trailing modifiers
    .replace(/[_-]?(event|action|click|submit|tracked)$/i, '')
    // Normalize separators
    .replace(/[-\s.]+/g, '_')
    // Collapse repeated underscores
    .replace(/_+/g, '_')
    // Trim underscores
    .replace(/^_+|_+$/g, '');
}

// ─── RULE 2: KEYWORD-BASED MATCHING ─────
/**
 * Returns true iff the detected event name (after normalization) shares a
 * meaningful intent fragment with any keyword for the candidate standard.
 *
 * "Shared word" requires at least one significant (>=3 char) underscore-token
 * to match between the normalized event name and the normalized keyword, to
 * avoid false positives like `view_promotion` matching `view_item` just on
 * the bare word `view`.
 */
function hasKeywordOverlap(detectedEventName: string, keywords: string[]): boolean {
  const detected = normalizeEventName(detectedEventName);
  if (!detected) return false;

  const detectedWords = new Set(detected.split('_').filter(w => w.length >= 3));

  for (const keyword of keywords) {
    const kw = normalizeEventName(keyword);
    if (!kw) continue;

    if (detected === kw) return true;
    if (!detected.includes(kw) && !kw.includes(detected)) continue;

    const kwWords = new Set(kw.split('_').filter(w => w.length >= 3));
    let shared = 0;
    for (const w of detectedWords) {
      if (kwWords.has(w)) shared++;
    }
    if (shared > 0) return true;
  }
  return false;
}

// ─── RULE 3: AI FALLBACK ─────
async function aiCheckEquivalence(
  candidateMissingEvent: string,
  candidateMissingDescription: string,
  detectedEvents: string[]
): Promise<CoverageResult> {
  if (detectedEvents.length === 0) {
    return { isCovered: false, coveredByEvent: null, method: 'no-events', reasoning: 'No events to compare against' };
  }
  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are an analytics expert. Decide whether a "missing" GA4 standard event is actually functionally covered by an existing custom event with a different name.

CANDIDATE MISSING EVENT:
- Name: ${candidateMissingEvent}
- Description: ${candidateMissingDescription}

DETECTED EVENTS ON SITE:
${detectedEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Equivalence examples:
- event_buy_now ≈ add_to_cart (both = product purchase intent click)
- event_view_more_details ≈ view_item (both = product detail view)
- product_card_tap ≈ select_item (both = product card click)

NOT equivalence:
- click ≠ purchase (click is generic, purchase is a transaction)
- page_view ≠ view_item (page_view fires on every page; view_item only on product pages)

Respond ONLY with this exact JSON (no other text, no markdown):
{ "isCovered": boolean, "coveredByEvent": "exact event name from the list" | null, "reasoning": "one short sentence" }`,
      }],
    });
    const textBlock = response.content.find((b: any) => b.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { isCovered: false, coveredByEvent: null, method: 'ai-check', reasoning: 'Could not parse AI response' };
    }
    const result = JSON.parse(jsonMatch[0]);
    return {
      isCovered: !!result.isCovered,
      coveredByEvent: result.coveredByEvent || null,
      method: 'ai-check',
      reasoning: result.reasoning || '',
    };
  } catch (err) {
    const msg = (err as Error)?.message || 'unknown';
    console.warn(`[event-equivalence] AI fallback failed for "${candidateMissingEvent}": ${msg}`);
    return { isCovered: false, coveredByEvent: null, method: 'ai-check', reasoning: `AI check error: ${msg}` };
  }
}

// ─── CACHE ───
// Bounded LRU-ish — capped at 500 entries; trims oldest 100 when full.
// The cache key includes a sorted snapshot of the detected event names so
// different scrapes with different event sets don't collide.
const coverageCache = new Map<string, CoverageResult>();
const CACHE_MAX = 500;

function cacheGet(key: string): CoverageResult | undefined {
  return coverageCache.get(key);
}
function cacheSet(key: string, value: CoverageResult): void {
  if (coverageCache.size >= CACHE_MAX) {
    let i = 0;
    for (const k of coverageCache.keys()) {
      coverageCache.delete(k);
      if (++i >= 100) break;
    }
  }
  coverageCache.set(key, value);
}

// ─── MAIN ENGINE ───
export async function findEventCoverage(
  candidateMissingEvent: string,
  candidateMissingDescription: string,
  detectedEventNames: string[]
): Promise<CoverageResult> {
  if (!candidateMissingEvent) {
    return { isCovered: false, coveredByEvent: null, method: 'no-events', reasoning: 'Empty candidate' };
  }
  if (detectedEventNames.length === 0) {
    return { isCovered: false, coveredByEvent: null, method: 'no-events', reasoning: 'No events to compare' };
  }

  // Use a sorted clone so cache key is order-independent (don't mutate caller's array).
  const sortedDetected = [...detectedEventNames].filter(Boolean).sort();
  const cacheKey = `${candidateMissingEvent.toLowerCase().trim()}::${sortedDetected.join('|')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // RULE 1 — normalized exact match
  const normalizedCandidate = normalizeEventName(candidateMissingEvent);
  for (const detected of sortedDetected) {
    if (normalizeEventName(detected) === normalizedCandidate) {
      const result: CoverageResult = {
        isCovered: true,
        coveredByEvent: detected,
        method: 'normalized-match',
        reasoning: `'${detected}' normalizes to the same canonical form as '${candidateMissingEvent}'`,
      };
      cacheSet(cacheKey, result);
      return result;
    }
  }

  // RULE 2 — keyword intent match
  const keywords = EVENT_INTENT_KEYWORDS[candidateMissingEvent.toLowerCase().trim()] || [];
  if (keywords.length > 0) {
    for (const detected of sortedDetected) {
      if (hasKeywordOverlap(detected, keywords)) {
        const result: CoverageResult = {
          isCovered: true,
          coveredByEvent: detected,
          method: 'keyword-match',
          reasoning: `'${detected}' contains an intent keyword for '${candidateMissingEvent}'`,
        };
        cacheSet(cacheKey, result);
        return result;
      }
    }
  }

  // RULE 3 — AI fallback (only when sets are reasonably small, to bound cost)
  if (sortedDetected.length <= 50) {
    const ai = await aiCheckEquivalence(candidateMissingEvent, candidateMissingDescription, sortedDetected);
    if (ai.isCovered) {
      cacheSet(cacheKey, ai);
      return ai;
    }
  }

  const noMatch: CoverageResult = {
    isCovered: false,
    coveredByEvent: null,
    method: 'no-match',
    reasoning: 'Not functionally covered by any detected event',
  };
  cacheSet(cacheKey, noMatch);
  return noMatch;
}

/** Test helper / explicit cache reset (e.g. for hot-reload). */
export function clearCoverageCache(): void {
  coverageCache.clear();
}
