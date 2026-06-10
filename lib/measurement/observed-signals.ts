// observed-signals.ts — pure adapter: tracking-spy capture → ObservedSignals.
//
// Kept SEPARATE from the browser orchestration (live-capture.ts) so the mapping
// is unit-testable with no Playwright in its module graph. Type-only imports of
// the spy/consent shapes are erased at runtime, so importing this never loads a
// browser. evaluateReadiness (readiness.ts) then consumes the ObservedSignals.

import type { NormalizedEvent } from '../tracking-spy/parsers.ts';
import type { ObservedEvent, ObservedSignals } from './types.ts';

// The subset of readTrackingSpyEvents()'s result the mapper consumes. The real
// TrackingSpyReadResult.events carry extra fields (firstSeenAt/lastSeenAt) — they
// are structurally assignable to this, so callers pass the result directly.
export interface SpyCapture {
  events: Array<NormalizedEvent & { count: number }>;
  rawHitCount: number;
}

// The subset of detectAndAcceptConsent()'s result the mapper consumes.
export interface ConsentCapture {
  detected: boolean;
  accepted: boolean;
}

// Map normalized spy events + consent + rawHitCount into the capture-agnostic
// ObservedSignals shape evaluateReadiness expects. Pure and deterministic.
export function toObservedSignals(
  url: string,
  spy: SpyCapture,
  consent: ConsentCapture | null
): ObservedSignals {
  const events: ObservedEvent[] = spy.events.map((e) => ({
    name: e.eventName,
    vendor: e.vendor,
    destinationId: e.measurementId ?? e.pixelId ?? undefined,
    parameters: Object.keys(e.parameters ?? {}),
    count: e.count,
  }));

  return {
    url,
    events,
    rawHitCount: spy.rawHitCount,
    consentBannerDetected: consent ? consent.detected : undefined,
    consentAccepted: consent ? consent.accepted : undefined,
  };
}
