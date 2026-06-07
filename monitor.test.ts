// monitor.test.ts — validates the trust logic against the oral-b reference site.
//
// Ported to Vitest from the original plain-script form. The fixtures are
// unchanged; the human-readable show()/console.log output was dropped in
// favour of explicit verdict assertions. pagesFiredOn here is the
// pages-fired-on proxy (capturedFromPages.length), NOT a true fire volume —
// see lib/monitor-adapter.ts.
import { describe, it, expect } from "vitest";
import type { MonitorRun } from "./lib/monitor-types";
import { diffRuns } from "./lib/monitor-diff";

// Baseline: a clean run of oral-b.co.in/en-in as recorded in the scorecard.
const baseline: MonitorRun = {
  runId: "base-001",
  siteUrl: "https://oral-b.co.in/en-in",
  timestamp: "2026-06-01T09:00:00Z",
  businessModel: "brand_catalog_with_retailers",
  infra: {
    ga4MeasurementId: "G-VNXKQZ77Z8",
    gtmContainerIds: ["GTM-MLL8548", "GTM-PZKPZ4XV"],
    pagesCrawled: 18,
    totalNetworkRequests: 540,
    hitChallengePage: false,
    consentBlocked: false,
    interactionAutomationFailed: false,
    loadErrors: 0,
  },
  events: [
    { name: "retailer_click", source: "ga4_network", paramKeys: ["retailer", "product_id"], pagesFiredOn: 12 },
    { name: "event_buy_now", source: "gtm_container", paramKeys: ["product_id"], pagesFiredOn: 8 },
    { name: "event_view_product_detail_page", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 22 },
    { name: "event_view_more_details", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 15 },
  ],
};

// Scenario A: a deploy broke the retailer outbound handler. retailer_click +
// event_buy_now stopped firing. Capture is clean. EXPECT: regression (critical).
const brokenCleanCapture: MonitorRun = {
  ...baseline,
  runId: "run-A",
  timestamp: "2026-06-06T09:00:00Z",
  infra: { ...baseline.infra },
  events: [
    { name: "retailer_click", source: "ga4_network", paramKeys: ["retailer", "product_id"], pagesFiredOn: 0 },
    { name: "event_buy_now", source: "gtm_container", paramKeys: ["product_id"], pagesFiredOn: 0 },
    { name: "event_view_product_detail_page", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 20 },
    { name: "event_view_more_details", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 14 },
  ],
};

// Scenario B: SAME missing events, but we hit a bot-challenge page and only
// crawled 4 pages. The events look "broken" but it's almost certainly our
// crawler that failed. EXPECT: inconclusive — NO false alarm.
const brokenButBlockedCrawl: MonitorRun = {
  ...baseline,
  runId: "run-B",
  timestamp: "2026-06-06T09:00:00Z",
  infra: {
    ga4MeasurementId: null,
    gtmContainerIds: [],
    pagesCrawled: 4,
    totalNetworkRequests: 90,
    hitChallengePage: true,
    consentBlocked: false,
    interactionAutomationFailed: true,
    loadErrors: 0,
  },
  events: [
    { name: "event_view_product_detail_page", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 2 },
  ],
};

// Scenario C: a clean run, nothing changed. EXPECT: ok.
const unchanged: MonitorRun = { ...baseline, runId: "run-C", timestamp: "2026-06-06T09:00:00Z" };

// Scenario D: partial degradation early-warning. No event fully disappeared,
// but event_view_product_detail_page dropped from firing on 22 pages to just 3
// on an otherwise-clean capture (a ~86% drop). This is the case the pages-
// fired-on proxy + ratio logic exists to catch: a large non-zero drop should
// surface a finding rather than be ignored as "still firing".
//
// NOTE: the original guidance described an 18 → 3 event; the shared baseline
// has no 18-count event, so this reuses the existing 22-count event to
// exercise the same ratio path against the real baseline. Flagged for review.
const partialDegradeCleanCapture: MonitorRun = {
  ...baseline,
  runId: "run-D",
  timestamp: "2026-06-06T09:00:00Z",
  infra: { ...baseline.infra },
  events: [
    { name: "retailer_click", source: "ga4_network", paramKeys: ["retailer", "product_id"], pagesFiredOn: 12 },
    { name: "event_buy_now", source: "gtm_container", paramKeys: ["product_id"], pagesFiredOn: 8 },
    { name: "event_view_product_detail_page", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 3 },
    { name: "event_view_more_details", source: "ga4_network", paramKeys: ["product_id"], pagesFiredOn: 15 },
  ],
};

describe("diffRuns — trust logic (oral-b reference)", () => {
  it("A — real break on a clean capture is a regression", () => {
    const r = diffRuns(brokenCleanCapture, baseline);
    expect(r.verdict).toBe("regression");
  });

  it("B — same break but a blocked crawl is inconclusive (no false alarm)", () => {
    const r = diffRuns(brokenButBlockedCrawl, baseline);
    expect(r.verdict).toBe("inconclusive");
  });

  it("C — nothing changed is ok", () => {
    const r = diffRuns(unchanged, baseline);
    expect(r.verdict).toBe("ok");
  });

  it("D — large partial drop on a clean capture is a regression (early warning)", () => {
    const r = diffRuns(partialDegradeCleanCapture, baseline);
    expect(r.verdict).toBe("regression");
  });
});
