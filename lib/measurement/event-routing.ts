// event-routing.ts — split each plan event into how it should be implemented:
//   - gtmCapturable: the ACTION is detectable by a GTM BUILT-IN TRIGGER (Form Submit,
//     Click, Element Visibility, History Change) AND the event needs no rich app-state
//     data → set up entirely in GTM, NO source-code push. Each one carries WHICH
//     built-in trigger captures it.
//   - needsRichPush: the event carries rich data from app internal state (values,
//     currency, item/product ids, plan names, counts) GTM can't read from the page →
//     a dataLayer.push must be PLACED in the site code (the assistive separate-file PR).
//
// The rule: route by (a) is the action detectable by a built-in trigger? AND (b) does
// it require rich app-state params? — detectable + no rich params → gtmCapturable (with
// its trigger); detectable + rich params → needsRichPush (GTM catches the action, not
// the data); not detectable → needsRichPush. Conservative on ambiguity. Pure (types
// only); never edits or injects anything.

import type { MeasurementPlan, TrackedEvent, EventParameter } from './types.ts';

export type GtmTrigger = 'formSubmit' | 'click' | 'linkClick' | 'elementVisibility' | 'historyChange';

export interface GtmCapturableEvent {
  event: TrackedEvent;
  trigger: GtmTrigger; // the built-in GTM trigger that captures it with NO code
}

export interface EventRouting {
  gtmCapturable: GtmCapturableEvent[];
  needsRichPush: TrackedEvent[];
}

// Human label for each built-in trigger — used in the UI's "no code" column.
export const TRIGGER_LABEL: Record<GtmTrigger, string> = {
  formSubmit: 'GTM Form Submit trigger',
  click: 'GTM Click trigger (All Elements)',
  linkClick: 'GTM Click trigger (Just Links)',
  elementVisibility: 'GTM Element Visibility trigger',
  historyChange: 'GTM History Change trigger',
};

// Parameter names that almost always come from app internal state (money, ids,
// product/plan, counts) — GTM can't reliably read these from the page/DOM/URL.
const RICH_NAME =
  /(?:^|_)(value|price|amount|revenue|total|subtotal|currency|coupon|discount|tax|shipping|item|items|product|sku|variant|plan|course|tier|package|quantity|qty|count|transaction|order)(?:_|$)|(?:^|_)id(?:s)?$/i;

// Does this param require rich app-state data GTM can't read from the page?
//  - source 'dataLayer'  → explicitly app-state (pushed) → rich.
//  - source 'page'/'gtm' → page/DOM/URL/auto readable → NOT rich, UNLESS its name
//    screams app-state (value/id/plan…) AND it's required → conservative rich
//    (don't over-promise GTM can read a money/id value off the page).
//  - any other (unknown) source → conservative rich.
function isRichParam(p: EventParameter): boolean {
  if (p.source === 'dataLayer') return true;
  if (p.source === 'page' || p.source === 'gtm') return p.required && RICH_NAME.test(p.name);
  return true;
}

// True when the event carries rich app-state data → a push is forced even if the
// ACTION itself is detectable by a built-in trigger (GTM catches the action, not the data).
function forcesPush(ev: TrackedEvent): boolean {
  return ev.parameters.some(isRichParam);
}

// Which built-in GTM trigger (if any) detects this action with NO source code.
// Conservative: returns null when not confidently detectable → needsRichPush.
export function detectTrigger(ev: TrackedEvent): GtmTrigger | null {
  const n = ev.name.toLowerCase();
  const c = ev.category;
  const formish = /(?:^|_)(form|form_submit|submit|sign_?up|signup|register|apply|application|subscribe|enquir|generate_lead)(?:_|$)/.test(n);

  // Form submissions → Form Submit trigger. A contact/link CTA that isn't itself a
  // form is a link click, not a submit.
  if (c === 'form' || formish) {
    if (/(?:^|_)(contact|call|whatsapp|email|mailto|phone|tel)(?:_|$)|click_to/.test(n) && !/form|submit/.test(n)) return 'linkClick';
    return 'formSubmit';
  }
  // Contact / outbound link clicks → Click (Just Links).
  if (/(?:^|_)(contact|call|whatsapp|email|mailto|phone|tel)(?:_|$)|click_to/.test(n)) return 'linkClick';
  // Promo/banner becoming visible → Element Visibility.
  if (/view_(promotion|promo|offer|item|banner)|impression|(?:promo|banner|hero|offer)_view/.test(n)) return 'elementVisibility';
  // Promo / CTA clicks → Click (All Elements).
  if (/select_(promotion|promo|offer)|(?:promo|offer|banner|cta|button)_click|click_(?:promo|offer|cta|button)/.test(n)) return 'click';
  // Page / route changes → History Change (SPA-friendly).
  if (c === 'page' || /(?:^|_)(page_view|pageview|screen_view|route_change|navigation)(?:_|$)/.test(n)) return 'historyChange';
  // Generic engagement interaction → Click (best-effort built-in).
  if (c === 'engagement') return 'click';

  return null;
}

export type RouteResult = { route: 'gtm'; trigger: GtmTrigger } | { route: 'rich' };

// Classify one event: (a) rich params force a push; else (b) a detectable action →
// gtmCapturable with its trigger; else → needsRichPush (conservative).
export function routeEvent(ev: TrackedEvent): RouteResult {
  if (forcesPush(ev)) return { route: 'rich' }; // GTM can catch the action, not the data
  const trigger = detectTrigger(ev);
  if (trigger) return { route: 'gtm', trigger };
  return { route: 'rich' }; // not detectable by any built-in trigger → human places it
}

export function classifyEvents(plan: MeasurementPlan): EventRouting {
  const gtmCapturable: GtmCapturableEvent[] = [];
  const needsRichPush: TrackedEvent[] = [];
  for (const ev of plan.events) {
    const r = routeEvent(ev);
    if (r.route === 'gtm') gtmCapturable.push({ event: ev, trigger: r.trigger });
    else needsRichPush.push(ev);
  }
  return { gtmCapturable, needsRichPush };
}
