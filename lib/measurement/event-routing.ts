// event-routing.ts — split each plan event into how it should be implemented,
// PURELY FROM ITS STRUCTURE (action type + parameter sources), NEVER from the event
// name. Works generically for any site's plan.
//
//   - gtmCapturable: the ACTION is detectable by a GTM BUILT-IN TRIGGER (Form Submit,
//     Click, Just-Links, Element Visibility, History Change) AND the event needs no
//     rich app-state data → set up entirely in GTM, NO code. Tagged with its trigger.
//   - needsRichPush: the event requires parameters sourced from APP INTERNAL STATE
//     GTM can't read from the page (value/currency/ids/dynamic names/counts), OR its
//     action isn't detectable by any built-in trigger → a dataLayer.push must be
//     PLACED in code (the assistive separate-file PR).
//
// Two STRUCTURAL questions, answered from plan fields only:
//   (A) detectable action? → from `triggerType` (preferred) else `category`.
//   (B) requires rich app-state params? → from each parameter's `source`.
// Routing: (A)&!(B) → gtmCapturable(trigger); (A)&(B) → rich; !(A) → rich;
//          ambiguous → rich (CONSERVATIVE — over-routing to manual is the safe error).
//
// NOTE: there is deliberately NO reference to `event.name` anywhere below — two
// events with identical structure but different names always classify identically.

import type { EventCategory, EventTriggerType, MeasurementPlan, ParameterSource, TrackedEvent } from './types.ts';

export type GtmTrigger = 'formSubmit' | 'click' | 'linkClick' | 'elementVisibility' | 'historyChange';

export interface GtmCapturableEvent {
  event: TrackedEvent;
  trigger: GtmTrigger; // the built-in GTM trigger that captures it with NO code
}

export interface EventRouting {
  gtmCapturable: GtmCapturableEvent[];
  needsRichPush: TrackedEvent[];
}

export const TRIGGER_LABEL: Record<GtmTrigger, string> = {
  formSubmit: 'GTM Form Submit trigger',
  click: 'GTM Click trigger (All Elements)',
  linkClick: 'GTM Click trigger (Just Links)',
  elementVisibility: 'GTM Element Visibility trigger',
  historyChange: 'GTM History Change trigger',
};

// ── (B) richness — purely from the parameter's declared SOURCE ──
// A param needs a placed push UNLESS GTM can read it. Only 'page'/'gtm'/'static' are
// readable; everything else ('appState'/'dataLayer'/'unknown'/any future) is rich.
const READABLE_SOURCES = new Set<ParameterSource>(['page', 'gtm', 'static']);

function isRichParam(source: ParameterSource): boolean {
  return !READABLE_SOURCES.has(source);
}

// True when the event carries rich app-state data → a push is forced even if the
// ACTION is detectable (GTM catches the action, not the data). Structural: reads
// only each parameter's `source`.
function forcesPush(ev: TrackedEvent): boolean {
  return ev.parameters.some((p) => isRichParam(p.source));
}

// ── (A) detectable action — from triggerType (preferred) else category ──
function triggerFromType(t: EventTriggerType): GtmTrigger | null {
  switch (t) {
    case 'formSubmit':
      return 'formSubmit';
    case 'linkClick':
      return 'linkClick';
    case 'click':
      return 'click';
    case 'elementVisibility':
      return 'elementVisibility';
    case 'historyChange':
    case 'pageView':
      return 'historyChange';
    case 'none':
      return null;
  }
}

// Coarse fallback when the plan didn't set a triggerType. GA4 categories only map
// cleanly for form / page / engagement; ecommerce/conversion/custom are ambiguous
// by category alone → null → conservative (needsRichPush).
function triggerFromCategory(c: EventCategory): GtmTrigger | null {
  switch (c) {
    case 'form':
      return 'formSubmit';
    case 'page':
      return 'historyChange';
    case 'engagement':
      return 'click';
    default:
      return null; // ecommerce / conversion / custom — not confidently detectable
  }
}

// The built-in GTM trigger that detects this event's action, or null. Structural:
// prefers the explicit `triggerType`, falls back to `category`. Never the name.
export function detectTrigger(ev: TrackedEvent): GtmTrigger | null {
  return ev.triggerType ? triggerFromType(ev.triggerType) : triggerFromCategory(ev.category);
}

export type RouteResult = { route: 'gtm'; trigger: GtmTrigger } | { route: 'rich' };

export function routeEvent(ev: TrackedEvent): RouteResult {
  if (forcesPush(ev)) return { route: 'rich' }; // (B) rich data → must be placed
  const trigger = detectTrigger(ev); // (A) detectable action?
  return trigger ? { route: 'gtm', trigger } : { route: 'rich' }; // else conservative
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
