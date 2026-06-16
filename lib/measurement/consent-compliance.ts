// consent-compliance.ts — pure, deterministic Consent & Compliance evaluator.
//
// Two READ-ONLY dimensions, folded into ONE evidence-backed verdict:
//
//   SETUP (slice 1) — "is consent set up?"
//     1. plan coherence  — computeConsentCoherenceProblems (the same logic the
//        gate's consent_coherent check uses; shared here so they never drift).
//     2. the consent BANNER signal — detectAndAcceptConsent's { detected, accepted }.
//     3. granular Consent Mode — the scraper's window.dataLayer read.
//
//   ENFORCEMENT (slice 2) — "does tracking respect consent?"
//     4. pre-consent tracking — outbound GA4/Ads/pixel hits captured BEFORE consent
//        was accepted (the real legal violation: a site that tracks before the user
//        agrees). Per-event violations name the specific requiresConsent events.
//
// Pure: no Playwright, no I/O. A missing capture for a dimension reads as
// 'inconclusive' for that dimension (mirror the gate's skipped pattern), NEVER a
// false fail / false violation. The overall verdict is the worst across both.

import type { ConsentModeStatus, ConsentPlan, MeasurementPlan, ObservedEvent, PreConsentObservation } from './types.ts';

// Outbound third-party trackers — an actual collect/hit going OUT to a vendor.
// Excludes 'GTM' (a dataLayer push is app-level, not itself an outbound hit), so a
// pre-consent dataLayer push that a consent-gated tag holds back is not a false
// violation; only a real network hit counts.
const OUTBOUND_TRACKING_VENDORS = new Set([
  'GA4', 'UA', 'GoogleAds', 'MetaPixel', 'TikTokPixel', 'LinkedInInsight',
  'BingUET', 'PinterestTag', 'TwitterPixel', 'Hotjar', 'Segment', 'Mixpanel',
  'Amplitude', 'AdobeAnalytics',
]);

export type ConsentVerdict = 'pass' | 'warn' | 'fail' | 'inconclusive';
export type ConsentIssueSeverity = 'warn' | 'fail';

export interface ConsentIssue {
  code: string; // stable machine code, e.g. 'consent_mode_missing'
  severity: ConsentIssueSeverity;
  message: string; // plain-English explanation
}

// The banner signal the evaluator consumes (subset of detectAndAcceptConsent).
export interface ConsentBannerResult {
  detected: boolean | null;
  accepted: boolean | null;
  cmp?: string | null;
}

export interface ConsentComplianceInput {
  plan: MeasurementPlan;
  bannerResult: ConsentBannerResult | null; // null = not captured
  consentModeStatus: ConsentModeStatus | null; // null = no live capture → inconclusive
  preConsent?: PreConsentObservation | null; // slice 2: what fired before consent (null/undefined = not observed)
}

export interface ConsentComplianceResult {
  verdict: ConsentVerdict;
  consentModeRequired: boolean; // plan.consent.consentModeRequired
  consentModePresent: boolean; // any default/update seen live
  consentModeV2: boolean; // ad_user_data / ad_personalization present
  hasDefault: boolean;
  hasUpdate: boolean;
  bannerDetected: boolean | null;
  bannerAccepted: boolean | null;
  cmp: string | null;
  captured: boolean; // a live Consent Mode read was available (setup dimension)
  // Enforcement dimension (slice 2):
  preConsentChecked: boolean; // the pre-consent window was observed
  preConsentTracking: boolean; // outbound tracking fired before consent
  preConsentHitCount: number; // how many outbound hits fired pre-consent
  preConsentEventNames: string[]; // requiresConsent events that fired pre-consent (the concrete violations)
  issues: ConsentIssue[];
  summary: string;
}

// The plan-coherence problems the gate's consent_coherent check reports. Kept
// here as the single source of truth so the evaluator folds in EXACTLY what that
// check flags — checkConsentCoherent (launch-readiness.ts) calls this too.
export function computeConsentCoherenceProblems(plan: MeasurementPlan): string[] {
  const consent: ConsentPlan = plan.consent;
  const problems: string[] = [];
  const anyRequiresConsent = plan.events.some((e) => e.requiresConsent);
  if (anyRequiresConsent && !consent.categoriesUsed.includes('analytics')) {
    problems.push("events set requiresConsent but consent.categoriesUsed is missing 'analytics'");
  }
  if (consent.consentModeRequired && consent.categoriesUsed.length === 0) {
    problems.push('consentModeRequired is true but consent.categoriesUsed is empty');
  }
  return problems;
}

const norm = (s: string) => s.toLowerCase().trim();
const vendorList = (events: ObservedEvent[]) => [...new Set(events.map((e) => e.vendor).filter(Boolean))].join(', ');

// Evaluate consent compliance from the plan + the (optional) live capture signals.
// Combines the SETUP dimension (slice 1) and the ENFORCEMENT dimension (slice 2)
// into one verdict — the worst across both. A dimension with no capture is simply
// not asserted (no issues added); it never becomes a false fail.
export function evaluateConsentCompliance(input: ConsentComplianceInput): ConsentComplianceResult {
  const { plan, bannerResult, consentModeStatus, preConsent } = input;
  const consentModeRequired = plan.consent.consentModeRequired === true;
  const anyRequiresConsent = plan.events.some((e) => e.requiresConsent);
  const bannerDetected = bannerResult ? bannerResult.detected : null;
  const bannerAccepted = bannerResult ? bannerResult.accepted : null;
  const cmp = bannerResult?.cmp ?? null;

  const issues: ConsentIssue[] = [];

  // (1) Plan coherence — capture-independent. Mirrors consent_coherent's severity:
  // a hard issue only when Consent Mode is required, else a soft warning.
  for (const p of computeConsentCoherenceProblems(plan)) {
    issues.push({ code: 'consent_incoherent', severity: consentModeRequired ? 'fail' : 'warn', message: p });
  }

  // ── SETUP dimension (slice 1): is consent set up? ──
  const captured = consentModeStatus !== null;
  const present = consentModeStatus?.active === true;
  const hasDefault = consentModeStatus?.hasDefault === true;
  const hasUpdate = consentModeStatus?.hasUpdate === true;
  const hasV2 = consentModeStatus?.hasV2Signals === true;

  if (captured) {
    if (consentModeRequired) {
      if (!present) {
        issues.push({
          code: 'consent_mode_missing',
          severity: 'fail',
          message: 'The plan requires Google Consent Mode, but no consent default/update signals were found on the page.',
        });
      } else {
        if (!hasUpdate) {
          issues.push({
            code: 'consent_mode_no_update',
            severity: 'warn',
            message: 'A consent default was found but no consent update — Consent Mode looks only partially wired (the CMP may not be signalling the user choice).',
          });
        }
        if (!hasV2) {
          issues.push({
            code: 'consent_mode_no_v2',
            severity: 'warn',
            message: 'Consent Mode v2 signals (ad_user_data / ad_personalization) were not found — required for Google Ads/GA4 compliance.',
          });
        }
        if (bannerDetected === false) {
          issues.push({
            code: 'consent_banner_not_detected',
            severity: 'warn',
            message: 'Consent Mode signals are present but no consent banner/CMP was detected — confirm users can actually grant or deny consent.',
          });
        }
      }
    } else if (bannerDetected === false && anyRequiresConsent) {
      issues.push({
        code: 'consent_banner_not_detected',
        severity: 'warn',
        message: 'The plan has consent-gated events but no consent banner/CMP was detected on the page.',
      });
    }
  }

  // ── ENFORCEMENT dimension (slice 2): does tracking respect consent? ──
  const preConsentChecked = preConsent?.ran === true;
  const preHits = preConsentChecked
    ? preConsent!.events.filter((e) => OUTBOUND_TRACKING_VENDORS.has(e.vendor ?? ''))
    : [];
  const requiresConsentNames = new Set(plan.events.filter((e) => e.requiresConsent).map((e) => norm(e.name)));
  const preConsentEventNames = [...new Set(preHits.map((e) => e.name).filter((n) => requiresConsentNames.has(norm(n))))];

  if (preConsentChecked && preHits.length > 0) {
    // Per-event violations are the concrete illegal cases → always fail.
    for (const name of preConsentEventNames) {
      issues.push({
        code: 'pre_consent_event',
        severity: 'fail',
        message: `"${name}" fired before consent was granted — this tracks users before they agree.`,
      });
    }
    // Other outbound hits not tied to a requiresConsent event: fail only when
    // Consent Mode is required, else a warning (a pre-consent hit on a setup that
    // doesn't require consent).
    const otherHits = preHits.filter((e) => !requiresConsentNames.has(norm(e.name)));
    if (otherHits.length > 0) {
      issues.push({
        code: 'pre_consent_tracking',
        severity: consentModeRequired ? 'fail' : 'warn',
        message: `${otherHits.length} tracking hit(s) (${vendorList(otherHits)}) fired before consent was granted.`,
      });
    }
  }

  // ── Combined verdict — worst across both dimensions; inconclusive only when
  // NEITHER dimension could be observed (never a false fail). ──
  const anyDefinitive = captured || preConsentChecked;
  let verdict: ConsentVerdict;
  if (issues.some((i) => i.severity === 'fail')) verdict = 'fail';
  else if (issues.some((i) => i.severity === 'warn')) verdict = 'warn';
  else if (anyDefinitive) verdict = 'pass';
  else verdict = 'inconclusive';

  const summary =
    verdict === 'fail'
      ? 'Consent compliance has blocking issue(s) — see below.'
      : verdict === 'warn'
        ? 'Consent compliance has item(s) to review — see below.'
        : verdict === 'pass'
          ? preConsentChecked && preHits.length === 0
            ? 'Consent is set up and no tracking fired before consent — compliant.'
            : 'Consent is set up and coherent with the plan.'
          : consentModeRequired
            ? 'Consent Mode is required by the plan, but no live capture was available to verify it. Re-run with a deployed URL.'
            : 'No live capture was available to verify consent on the page.';

  return {
    verdict,
    consentModeRequired,
    consentModePresent: present,
    consentModeV2: hasV2,
    hasDefault,
    hasUpdate,
    bannerDetected,
    bannerAccepted,
    cmp,
    captured,
    preConsentChecked,
    preConsentTracking: preConsentChecked && preHits.length > 0,
    preConsentHitCount: preHits.length,
    preConsentEventNames,
    issues,
    summary,
  };
}
