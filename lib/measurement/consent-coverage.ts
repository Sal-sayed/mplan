// consent-coverage.ts — plan-level, per-event consent coverage (PURE, no IO).
//
// The COMPLETE per-event consent view: for EVERY event in the plan, whether it
// requires consent and whether the plan's consent categories cover it. Unlike
// slices 1 & 2 (which verify the LIVE site for observed events only), this needs
// no live capture — it reads the plan, so it always works, before any deploy.
//
// Reuses isEventConsentCovered / GATED_EVENT_CONSENT_CATEGORY from
// consent-compliance.ts (the SAME rule the gate's consent_coherent check uses) —
// the coverage verdict can never disagree with the coherence check.

import type { EventCategory, MeasurementPlan } from './types.ts';
import { GATED_EVENT_CONSENT_CATEGORY, isEventConsentCovered } from './consent-compliance.ts';

export type ConsentCoverageStatus = 'ok' | 'needs_attention';

export interface ConsentCoverageRow {
  eventId: string;
  eventName: string;
  isKeyEvent: boolean;
  requiresConsent: boolean;
  category: EventCategory;
  consentCategoryCovered: boolean; // covered by the plan's consent categories
  status: ConsentCoverageStatus;
  note: string; // plain-English explanation
}

export interface ConsentCoverage {
  rows: ConsentCoverageRow[];
  requiredConsentCategory: string; // the category a gated event needs (single source of truth)
  summary: {
    totalEvents: number;
    requiresConsentCount: number;
    needsAttentionCount: number;
  };
}

// Build the per-event consent coverage table. needs_attention rows sort first (so
// problems are visible), key events first within a group.
export function buildConsentCoverage(plan: MeasurementPlan): ConsentCoverage {
  const rows: ConsentCoverageRow[] = plan.events.map((ev) => {
    const covered = isEventConsentCovered(ev, plan.consent);
    const status: ConsentCoverageStatus = ev.requiresConsent && !covered ? 'needs_attention' : 'ok';
    const note = !ev.requiresConsent
      ? 'No consent required.'
      : covered
        ? `Requires consent; covered by the '${GATED_EVENT_CONSENT_CATEGORY}' consent category.`
        : `Requires consent but the '${GATED_EVENT_CONSENT_CATEGORY}' category isn't in the plan's consent categories.`;
    return {
      eventId: ev.id,
      eventName: ev.name,
      isKeyEvent: ev.isKeyEvent,
      requiresConsent: ev.requiresConsent,
      category: ev.category,
      consentCategoryCovered: covered,
      status,
      note,
    };
  });

  // needs_attention first; within a status group, key events first; stable otherwise.
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'needs_attention' ? -1 : 1;
    if (a.isKeyEvent !== b.isKeyEvent) return a.isKeyEvent ? -1 : 1;
    return 0;
  });

  return {
    rows,
    requiredConsentCategory: GATED_EVENT_CONSENT_CATEGORY,
    summary: {
      totalEvents: rows.length,
      requiresConsentCount: rows.filter((r) => r.requiresConsent).length,
      needsAttentionCount: rows.filter((r) => r.status === 'needs_attention').length,
    },
  };
}
