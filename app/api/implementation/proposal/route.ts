// POST /api/implementation/proposal — Phase A implementation guidance (READ-ONLY).
//
// Derives an implementation proposal from a posted MeasurementPlan: the GTM
// trigger + GA4 tag + dataLayer push that would implement each event, with a
// why-explanation. It makes NO Google/GTM API call, requests NO write scope, and
// writes nothing — it only derives-from-the-plan. Same plan-validation guard as
// the other plan routes (rate-limit + validateMeasurementPlan + meta). No operator
// gate (pure derivation over the caller's own plan, like /api/launch-readiness).
//
// Body: { plan: MeasurementPlan } → { success, proposal } | { success:false, error }.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { buildImplementationProposal } from '@/lib/measurement/implementation-proposal';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 15; // pure in-memory derivation — no browser, no Google call

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getClientIdentifier(req));
  if (!rl.allowed) {
    const resetMinutes = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000 / 60));
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Try again in ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.` },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.plan) {
    return NextResponse.json({ success: false, error: 'Provide a generated plan.' }, { status: 400 });
  }
  try {
    validateMeasurementPlan(body.plan);
  } catch (err) {
    return NextResponse.json({ success: false, error: `Invalid plan: ${(err as Error)?.message ?? 'unknown shape'}` }, { status: 400 });
  }
  const meta = body.plan.meta;
  if (!meta || typeof meta.url !== 'string' || typeof meta.businessModel !== 'string' || typeof meta.schemaVersion !== 'string') {
    return NextResponse.json({ success: false, error: 'Plan is missing meta (url, businessModel, schemaVersion).' }, { status: 400 });
  }

  const proposal = buildImplementationProposal(body.plan as MeasurementPlan);
  return NextResponse.json({ success: true, proposal }, { headers: rateLimitHeaders(rl) });
}
