// consent-compliance.ts — pure, deterministic Consent & Compliance evaluator.
//
// Slice 1 of the Consent & Compliance Monitor agent: "Consent Mode Verification".
// Folds three READ-ONLY signals into one evidence-backed verdict:
//   1. plan coherence  — computeConsentCoherenceProblems (the same logic the
//      gate's consent_coherent check uses; shared here so they never drift).
//   2. the consent BANNER signal — detectAndAcceptConsent's { detected, accepted }.
//   3. granular Consent Mode — the scraper's window.dataLayer read
//      ({ active, hasDefault, hasUpdate, hasV2Signals }).
//
// Pure: no Playwright, no I/O. consentModeStatus === null means "no live capture"
// → verdict 'inconclusive' (mirror the gate's skipped pattern), NEVER a false fail.
// This does NOT do the slice-2 pre-consent-enforcement pass (a consent-DENIED
// capture); it only verifies what the single existing capture already reveals.

import type { ConsentModeStatus, ConsentPlan, MeasurementPlan } from './types.ts';

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
  captured: boolean; // a live Consent Mode read was available
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

function worstVerdict(issues: ConsentIssue[]): 'pass' | 'warn' | 'fail' {
  if (issues.some((i) => i.severity === 'fail')) return 'fail';
  if (issues.some((i) => i.severity === 'warn')) return 'warn';
  return 'pass';
}

// Evaluate consent compliance from the plan + the (optional) live capture signals.
export function evaluateConsentCompliance(input: ConsentComplianceInput): ConsentComplianceResult {
  const { plan, bannerResult, consentModeStatus } = input;
  const consentModeRequired = plan.consent.consentModeRequired === true;
  const bannerDetected = bannerResult ? bannerResult.detected : null;
  const bannerAccepted = bannerResult ? bannerResult.accepted : null;
  const cmp = bannerResult?.cmp ?? null;

  const issues: ConsentIssue[] = [];

  // (1) Plan coherence — capture-independent. Mirrors consent_coherent's severity:
  // a hard issue only when Consent Mode is required, else a soft warning.
  for (const p of computeConsentCoherenceProblems(plan)) {
    issues.push({ code: 'consent_incoherent', severity: consentModeRequired ? 'fail' : 'warn', message: p });
  }

  const captured = consentModeStatus !== null;
  const present = consentModeStatus?.active === true;
  const hasDefault = consentModeStatus?.hasDefault === true;
  const hasUpdate = consentModeStatus?.hasUpdate === true;
  const hasV2 = consentModeStatus?.hasV2Signals === true;

  // (2) No live Consent Mode read → inconclusive on the live aspect. Plan-coherence
  // issues are still surfaced, but we never turn a missing capture into a fail.
  if (!captured) {
    return {
      verdict: 'inconclusive',
      consentModeRequired,
      consentModePresent: false,
      consentModeV2: false,
      hasDefault: false,
      hasUpdate: false,
      bannerDetected,
      bannerAccepted,
      cmp,
      captured: false,
      issues,
      summary: consentModeRequired
        ? 'Consent Mode is required by the plan, but no live capture was available to verify it. Re-run with a deployed URL.'
        : 'No live capture was available to verify Consent Mode on the page.',
    };
  }

  // (3) Live Consent Mode evidence.
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
  } else if (bannerDetected === false && plan.events.some((e) => e.requiresConsent)) {
    // Not strictly required, but the plan has consent-gated events and no banner.
    issues.push({
      code: 'consent_banner_not_detected',
      severity: 'warn',
      message: 'The plan has consent-gated events but no consent banner/CMP was detected on the page.',
    });
  }

  const verdict = worstVerdict(issues);
  const summary =
    verdict === 'pass'
      ? present
        ? `Consent Mode is configured${hasV2 ? ' (v2)' : ''} and coherent with the plan.`
        : 'Consent Mode is not required by the plan and no compliance issues were found.'
      : verdict === 'fail'
        ? 'Consent compliance has blocking issue(s) — see below.'
        : 'Consent compliance has item(s) to review — see below.';

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
    captured: true,
    issues,
    summary,
  };
}
