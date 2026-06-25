// event-routing.ts — split each plan event into how it should be implemented:
//   - gtmCapturable: GTM can detect the action at runtime (page/history view, form
//     submission, element click/scroll) AND its params are none or readable from the
//     page (DOM/URL) → set up entirely in GTM, NO source-code push needed.
//   - needsRichPush: the event carries app-internal data (values, IDs, currency,
//     item arrays) GTM can't read from the page → a dataLayer.push must be PLACED in
//     the site code by the developer (delivered as the assistive separate-file PR).
//
// Deterministic + conservative: any app-state parameter, or an ambiguous category,
// routes to needsRichPush — so it goes to the human, never silently auto-handled wrong.
// Pure (types only); never edits or injects anything.

import type { MeasurementPlan, TrackedEvent } from './types.ts';

export interface EventRouting {
  gtmCapturable: TrackedEvent[];
  needsRichPush: TrackedEvent[];
}

// Categories whose action GTM can detect at runtime without a source push:
// page/history views, form submissions, element clicks / scroll (engagement).
const GTM_DETECTABLE_CATEGORIES: ReadonlySet<TrackedEvent['category']> = new Set([
  'page',
  'form',
  'engagement',
]);

// A single event's route. `source: 'dataLayer'` means the value comes from app
// internal state — GTM can't read it from the page, so the site must push it.
export function routeEvent(ev: TrackedEvent): 'gtm' | 'rich' {
  const hasAppStateParam = ev.parameters.some((p) => p.source === 'dataLayer');
  if (hasAppStateParam) return 'rich'; // rich data → must be placed in code

  // No app-state params (none, or page/gtm-readable): GTM can capture it IF the
  // action itself is one GTM detects.
  if (GTM_DETECTABLE_CATEGORIES.has(ev.category)) return 'gtm';

  // Unsure (e.g. ecommerce/conversion/custom without explicit page params) →
  // conservative: hand it to the developer rather than risk auto-handling it wrong.
  return 'rich';
}

export function classifyEvents(plan: MeasurementPlan): EventRouting {
  const gtmCapturable: TrackedEvent[] = [];
  const needsRichPush: TrackedEvent[] = [];
  for (const ev of plan.events) {
    if (routeEvent(ev) === 'gtm') gtmCapturable.push(ev);
    else needsRichPush.push(ev);
  }
  return { gtmCapturable, needsRichPush };
}
