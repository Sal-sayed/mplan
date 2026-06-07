// monitor-types.ts
// Shared types for the stateful Tracking-Health Monitor.
//
// NOTE: This file was reconstructed from the exact contracts the other monitor
// modules import (capture-confidence.ts, materiality.ts, monitor-diff.ts) plus
// the monitor.test.ts fixtures — every shape here is pinned by usage, not
// invented. Replace it wholesale if your canonical version differs.
//
// Capture-to-capture only: nothing here references the Measurement Plan
// generation code. The "what should fire" baseline is the previous stored run.

// The business-model vocabulary the materiality map is keyed on. These eight
// values mirror the auditor's BusinessModelType MINUS 'unknown' — the auditor
// can emit 'unknown', but EVENT_MATERIALITY has no key for it, so the adapter
// coerces 'unknown' -> 'informational' (the safe, no-false-alarm bucket).
export type BusinessModel =
  | "direct_ecommerce"
  | "brand_catalog_with_retailers"
  | "lead_generation"
  | "saas"
  | "content_publisher"
  | "marketplace"
  | "service_booking"
  | "informational";

// Where a captured event came from. ga4_network + gtm_container are exercised
// by the test; meta_pixel + other are produced by the adapter from the
// auditor's metaPixelEvents / otherPixelEvents buckets.
export type CaptureSource = "ga4_network" | "gtm_container" | "meta_pixel" | "other";

export interface CapturedEvent {
  name: string;
  source: CaptureSource;
  paramKeys: string[];
  // pagesFiredOn: the number of distinct pages this event was captured on
  // (auditor's capturedFromPages.length). This is a COVERAGE proxy, NOT a true
  // fire volume — the auditor dedupes events, so real per-hit counts are not
  // available. Named honestly so downstream logic doesn't read it as volume.
  pagesFiredOn: number;
}

// Run-level capture signals. These tell us how much to TRUST a run before we
// dare diff it. No per-event counts live here — those are on CapturedEvent.
export interface CaptureInfra {
  ga4MeasurementId: string | null;
  gtmContainerIds: string[];
  pagesCrawled: number;
  totalNetworkRequests: number;
  hitChallengePage: boolean;
  consentBlocked: boolean;
  interactionAutomationFailed: boolean;
  loadErrors: number;
}

export interface MonitorRun {
  runId: string;
  siteUrl: string;
  timestamp: string;
  businessModel: BusinessModel;
  infra: CaptureInfra;
  events: CapturedEvent[];
}

// Output of scoreCaptureConfidence(). trustworthy gates the three-state verdict:
// a divergence on an untrustworthy run becomes "inconclusive", never a false
// "regression".
export interface CaptureConfidence {
  score: number;
  trustworthy: boolean;
  reasons: string[];
}
