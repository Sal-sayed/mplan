// governance.ts — Measurement Governance v0 (on-demand "setup drift" check).
//
// "Is my plan still correctly set up in GA4/GTM?" — answerable any time after
// launch. This is LITERALLY the launch-readiness gate's CONFIG checks: it calls
// runLaunchReadinessGate with the GA4/GTM connectors present and deployedSiteUrl
// ABSENT, so the deterministic plan checks + live GA4/GTM config checks run while
// the 4 deployed_site checks (which would spawn a browser capture) stay 'skipped'.
// Governance is about whether the SETUP is still right, not live event capture.
//
// Maximum reuse — no new report shape, no persistence, no diff/scheduler. The
// drift-over-time feature (diffing consecutive runs) + its persistence spine are
// a SEPARATE later slice (resurrecting monitor-store/monitor-diff from 0fcd396).

import {
  runLaunchReadinessGate,
  type ReadinessCheckOptions,
  type LaunchReadinessResult,
} from './launch-readiness.ts';
import type { MeasurementPlan } from './types.ts';

export interface GovernanceContext {
  url: string;
  plan: MeasurementPlan;
  ga4?: { propertyId: string };
  gtm?: { containerId: string };
}

// opts is the gate's existing DI seam (getGoogleAccessToken / fetchGa4Config /
// fetchGtmConfig) — passed through unchanged so callers/tests can inject the
// Google readers; production leaves it empty and the gate dynamically imports the
// real token store + REST readers.
export async function runGovernanceCheck(
  ctx: GovernanceContext,
  opts: ReadinessCheckOptions = {}
): Promise<LaunchReadinessResult> {
  return runLaunchReadinessGate(
    {
      url: ctx.url,
      plan: ctx.plan,
      // GA4/GTM connectors ONLY — never a deployedSiteUrl, so no browser capture
      // runs and the deployed_site checks stay 'skipped'.
      connectors: {
        ...(ctx.ga4 ? { ga4: ctx.ga4 } : {}),
        ...(ctx.gtm ? { gtm: ctx.gtm } : {}),
      },
    },
    opts
  );
}
