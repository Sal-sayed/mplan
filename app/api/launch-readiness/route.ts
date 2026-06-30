// POST /api/launch-readiness — the pre-launch go/no-go gate (credential-free).
//
// Runs the deterministic plan-consistency checks and, when a deployedSiteUrl is
// supplied, captures the live site ONCE and reconciles it (evaluateReadiness) to
// fill the 4 deployed_site checks. The 5 GA4/GTM OAuth checks stay 'skipped'.
//
// Non-streaming JSON with a high maxDuration, mirroring /api/audit-existing-site
// (the existing long-running browser route). The live capture launches a headless
// browser, so this can take tens of seconds when deployedSiteUrl is set.
//
// Body: { plan: MeasurementPlan, deployedSiteUrl?, requireApproval?, strictOnSkipped? }
// Returns: { success: true, report } | { success: false, error }.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { runLaunchReadinessGate, type ReadinessCheckOptions } from '@/lib/measurement/launch-readiness';
import { coerceRawHits, observedSignalsFromHits } from '@/lib/measurement/spy-import';
import { isOperatorRequest, resolveOwnerId } from '@/lib/auth';
import type { MeasurementPlan, ObservedSignals } from '@/lib/measurement/types';

export const maxDuration = 120; // live capture launches a headless browser

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//.test(v.trim());
}

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

  // ...then guard meta — validateMeasurementPlan deliberately skips it, but the
  // gate reads plan.meta.url / businessModel / schemaVersion.
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

  let deployedSiteUrl: string | undefined;
  if (body.deployedSiteUrl !== undefined && body.deployedSiteUrl !== null && body.deployedSiteUrl !== '') {
    if (!isHttpUrl(body.deployedSiteUrl)) {
      return NextResponse.json(
        { success: false, error: 'deployedSiteUrl must start with http:// or https://' },
        { status: 400 }
      );
    }
    deployedSiteUrl = body.deployedSiteUrl.trim();
  }

  // GA4/GTM identifiers drive the Google-backed checks. Admin-gated so an
  // anonymous visitor can't use the operator's stored Google token. Without
  // admin (or ids), those 5 checks simply stay 'skipped'.
  let ga4Connector: { propertyId: string } | undefined;
  let gtmConnector: { containerId: string } | undefined;
  if (await isOperatorRequest(req)) {
    if (typeof body.ga4?.propertyId === 'string' && body.ga4.propertyId.trim()) {
      ga4Connector = { propertyId: body.ga4.propertyId.trim() };
    }
    if (typeof body.gtm?.containerId === 'string' && body.gtm.containerId.trim()) {
      gtmConnector = { containerId: body.gtm.containerId.trim() };
    }
  }

  // Tracking Spy import: when a real captured session is pasted in (RawHit[] from
  // the extension), use it as the observed signals — NO headless browser. We trigger
  // the gate's capture+reconcile path with the plan's own URL and inject a capture
  // function that returns the signals built from the hits. The plan is then validated
  // against what ACTUALLY fired, and events that fired but aren't planned surface as
  // "fired but not in the plan" (candidates to add).
  let captureFromHits: ((url: string) => Promise<ObservedSignals>) | undefined;
  if (Array.isArray(body.capturedHits) && body.capturedHits.length > 0) {
    const hits = coerceRawHits(body.capturedHits);
    if (hits.length > 0) {
      deployedSiteUrl = deployedSiteUrl || meta.url; // a URL is needed to enter the reconcile path
      const captureUrl = String(deployedSiteUrl ?? meta.url ?? '');
      captureFromHits = async () => observedSignalsFromHits(captureUrl, hits);
    }
  }

  const connectors = {
    ...(deployedSiteUrl ? { deployedSiteUrl } : {}),
    ...(ga4Connector ? { ga4: ga4Connector } : {}),
    ...(gtmConnector ? { gtm: gtmConnector } : {}),
  };

  const opts: ReadinessCheckOptions = { ownerId: await resolveOwnerId(req) }; // Stage 4: this owner's Google token
  if (captureFromHits) opts.captureObservedSignals = captureFromHits; // use the pasted capture, not Playwright
  if (typeof body.requireApproval === 'boolean') opts.requireApproval = body.requireApproval;
  if (typeof body.strictOnSkipped === 'boolean') opts.strictOnSkipped = body.strictOnSkipped;

  try {
    const { report } = await runLaunchReadinessGate(
      { url: meta.url, plan, connectors: Object.keys(connectors).length ? connectors : undefined },
      opts
    );
    return NextResponse.json({ success: true, report }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    const message = (err as Error)?.message || 'Launch readiness check failed';
    console.error('[launch-readiness] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
