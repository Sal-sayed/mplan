// POST /api/governance/check — Measurement Governance v0 (on-demand setup-drift
// check). Re-runs the launch-readiness gate's CONFIG checks (deterministic plan
// checks + live GA4/GTM config checks) so a user can ask "is my plan still
// correctly set up in GA4/GTM?" after launch. NO browser capture (deployedSiteUrl
// is never used here), NO persistence, NO drift/diff — those are separate later
// slices.
//
// Mirrors /api/launch-readiness conventions exactly: same rate-limit, same
// validateMeasurementPlan + meta guard, and the SAME operator gate — an anonymous
// caller cannot inject ga4/gtm connectors, so those checks stay 'skipped'.
//
// Body: { plan: MeasurementPlan, ga4?: { propertyId }, gtm?: { containerId },
//         persist?: boolean, compareToLast?: boolean }
// Returns: { success: true, report, drift? } | { success: false, error }.
//
// PERSISTENCE (additive — default behavior unchanged): with persist:true the run
// is stored (Supabase, keyed by site + plan); with compareToLast:true the run is
// diffed against the latest prior stored run for drift. Persistence is best-
// effort — a storage failure never dead-ends the check (the report still returns,
// drift omitted).

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { runGovernanceCheck } from '@/lib/measurement/governance';
import { saveRun, getLatestRun, buildGovernanceRun, planKeyFor } from '@/lib/measurement/governance-store';
import { diffReports, type GovernanceDrift } from '@/lib/measurement/governance-diff';
import { isOperatorRequest } from '@/lib/auth';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 30; // config-only (GA4/GTM Admin reads) — no browser capture

export async function POST(req: NextRequest) {
  const clientId = getClientIdentifier(req);
  const rl = await checkRateLimit(clientId);
  if (!rl.allowed) {
    const resetMinutes = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000 / 60));
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. You can submit ${rl.limit} requests per hour. Try again in ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.`,
        rateLimitInfo: { limit: rl.limit, remaining: rl.remaining, resetInMinutes: resetMinutes },
      },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body?.plan) {
    return NextResponse.json({ success: false, error: 'Provide a generated plan to check.' }, { status: 400 });
  }

  // Reuse the pipeline's hand-rolled validator for the plan body...
  try {
    validateMeasurementPlan(body.plan);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Invalid plan: ${(err as Error)?.message ?? 'unknown shape'}` },
      { status: 400 }
    );
  }

  // ...then guard meta — validateMeasurementPlan skips it, but the gate reads
  // plan.meta.url / businessModel / schemaVersion.
  const meta = body.plan.meta;
  if (
    !meta ||
    typeof meta.url !== 'string' ||
    typeof meta.businessModel !== 'string' ||
    typeof meta.schemaVersion !== 'string'
  ) {
    return NextResponse.json(
      { success: false, error: 'Plan is missing meta (url, businessModel, schemaVersion).' },
      { status: 400 }
    );
  }

  const plan = body.plan as MeasurementPlan;

  // GA4/GTM identifiers drive the Google-backed config checks. Operator-gated
  // (the SAME gate as /api/launch-readiness) so an anonymous visitor can't use the
  // operator's stored Google token; without it those checks stay 'skipped'.
  let ga4: { propertyId: string } | undefined;
  let gtm: { containerId: string } | undefined;
  if (await isOperatorRequest(req)) {
    if (typeof body.ga4?.propertyId === 'string' && body.ga4.propertyId.trim()) {
      ga4 = { propertyId: body.ga4.propertyId.trim() };
    }
    if (typeof body.gtm?.containerId === 'string' && body.gtm.containerId.trim()) {
      gtm = { containerId: body.gtm.containerId.trim() };
    }
  }

  // Additive persistence flags. Absent/false → behaves exactly as v0 (no store
  // touch, no drift, returns { success, report } only).
  const persist = body?.persist === true;
  const compareToLast = body?.compareToLast === true;

  try {
    const { report } = await runGovernanceCheck({ url: meta.url, plan, ga4, gtm });

    // Drift + persistence are wrapped so a storage failure (Supabase down /
    // unconfigured) NEVER dead-ends the check — we still return the report.
    let drift: GovernanceDrift | undefined;
    if (persist || compareToLast) {
      try {
        const planKey = planKeyFor(plan);
        // Diff against the PRIOR latest BEFORE saving this run (else the latest
        // would be this very run).
        if (compareToLast) {
          const prior = await getLatestRun(meta.url, planKey);
          if (prior) drift = diffReports(prior.report, report);
        }
        if (persist) {
          // Persist the plan + connectors alongside the report so an unattended
          // re-run (the scheduler) can reconstruct this exact check.
          const connectors = ga4 || gtm ? { ...(ga4 ? { ga4 } : {}), ...(gtm ? { gtm } : {}) } : undefined;
          await saveRun(buildGovernanceRun(report, plan, connectors));
        }
      } catch (err) {
        // Persistence is additive — log and continue with the report intact.
        console.warn('[governance/check] persistence skipped:', (err as Error)?.message);
      }
    }

    return NextResponse.json(
      { success: true, report, ...(drift ? { drift } : {}) },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    const message = (err as Error)?.message || 'Governance check failed';
    console.error('[governance/check] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
