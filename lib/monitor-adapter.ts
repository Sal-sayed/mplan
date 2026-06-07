// monitor-adapter.ts
// The ONLY bridge between the (read-only) existing-site auditor and the monitor.
// It maps the real auditExistingSite() output (AuditResult) onto a MonitorRun.
//
// HARD BOUNDARY: this imports the audit types only. It never touches the
// Measurement Plan generation code — the monitor compares audit-to-audit.
//
// Where the audit does not yet surface a CaptureInfra signal, we set a SAFE
// default and leave a // TODO: rather than fabricate a value. Two fields are
// honest proxies (clearly named/commented), because the audit dedupes events
// and has no request counter:
//   • CapturedEvent.pagesFiredOn  = capturedFromPages.length  (coverage, not volume)
//   • CaptureInfra.totalNetworkRequests = total captured analytics hits (proxy)

import type {
  AuditResult,
  BusinessModelType,
  GA4Event,
  PixelEvent,
} from "./existing-site-auditor";
import type {
  BusinessModel,
  CaptureInfra,
  CapturedEvent,
  MonitorRun,
} from "./monitor-types";

// The auditor's BusinessModelType has nine values; the monitor's BusinessModel
// has eight (EVENT_MATERIALITY has no 'unknown' key). Coerce the extra value to
// the safe, no-false-alarm bucket so severityForEvent() never hits undefined.
function toBusinessModel(t: BusinessModelType): BusinessModel {
  if (t === "unknown") return "informational";
  return t;
}

function makeRunId(siteUrl: string, completedAt: string): string {
  let host = siteUrl;
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  const slug = host.replace(/[^a-z0-9]+/gi, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${slug}_${completedAt}_${rand}`;
}

// GA4 / Meta / other "firing" events carry a real coverage proxy.
function firedEvent(
  e: GA4Event | PixelEvent,
  source: CapturedEvent["source"]
): CapturedEvent {
  return {
    name: e.eventName,
    source,
    paramKeys: Object.keys(e.parameters || {}),
    pagesFiredOn: (e.capturedFromPages || []).length,
  };
}

export function toMonitorRun(audit: AuditResult, siteUrl: string): MonitorRun {
  const url = siteUrl || audit.submittedUrl;

  // --- Events, source-separated to match the diff's name+source keying ---
  const events: CapturedEvent[] = [
    ...audit.ga4Events.map((e) => firedEvent(e, "ga4_network")),
    ...audit.metaPixelEvents.map((e) => firedEvent(e, "meta_pixel")),
    ...audit.otherPixelEvents.map((e) => firedEvent(e, "other")),
    // GTM container events are CONFIGURED, not fired — the audit only knows they
    // are declared (no params, no per-page firing). Model that as presence: a
    // declared event has pagesFiredOn = 1 ("declared & present"); if it vanishes
    // from the container next run it becomes absent => a disappearance finding.
    ...audit.gtmContainerEvents.map((e) => ({
      name: e.eventName,
      source: "gtm_container" as const,
      paramKeys: [], // TODO: auditor's GTM parser does not expose tag params.
      pagesFiredOn: 1,
    })),
  ];

  // --- Run-level capture signals ---
  const loadErrors = audit.pagesScanned.filter((p) => !p.loadedSuccessfully).length;

  // Honest proxy: the audit has no network-request tally, but capture
  // confidence only uses totalNetworkRequests as a RELATIVE ratio vs. baseline
  // ("did the page load as much as last time"). Total captured analytics hits is
  // a reasonable stand-in for that volume. TODO: have the auditor expose a real
  // request counter (it already has a page.on('request') listener).
  const totalNetworkRequests =
    audit.ga4Events.length +
    audit.metaPixelEvents.length +
    audit.otherPixelEvents.length;

  const infra: CaptureInfra = {
    ga4MeasurementId: audit.measurementIds.ga4[0] ?? null,
    gtmContainerIds: audit.measurementIds.gtm,
    pagesCrawled: audit.totalPagesScanned,
    totalNetworkRequests,
    // TODO: the auditor does not classify bot-challenge / CAPTCHA pages yet. A
    // challenge page often "loads successfully" with a 200, so loadErrors won't
    // catch it. Default safe (false) until the auditor surfaces this signal.
    hitChallengePage: false,
    // Derived: a banner was found but never dismissed => events may be gated.
    consentBlocked: audit.consentResult.detected && !audit.consentResult.accepted,
    // Heuristic proxy: zero interactions almost always means the interaction
    // engine failed. TODO: have automateInteraction() surface an explicit flag.
    interactionAutomationFailed: audit.interactionStats.totalActions === 0,
    loadErrors,
  };

  return {
    runId: makeRunId(url, audit.completedAt),
    siteUrl: url,
    timestamp: audit.completedAt,
    businessModel: toBusinessModel(audit.businessModel.primaryType),
    infra,
    events,
  };
}
