// POST /api/metrics/validate — surface the threshold Data Validation agent.
//
// For each KEY EVENT in the plan, judges its recent eventCount history against a
// trailing baseline (data-validation.ts) and returns the verdict. Reads only the
// already-collected metric history (no Google call) — but the property id is
// operator-gated (the SAME gate as /api/governance/check) so an anonymous visitor
// can't probe the operator's metric data. Without an operator + property, it
// returns propertyChecked:false and empty results (the UI shows a quiet note).
//
// Body: { plan: MeasurementPlan, ga4?: { propertyId } }
// Returns: { success, propertyChecked, results: MetricHealthEntry[] } | { success:false, error }.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { validateMetrics, type MetricHealthEntry } from '@/lib/measurement/data-validation';
import { isOperatorRequest, resolveOwnerId } from '@/lib/auth';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 30; // reads stored history only — no browser, no Google call

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
    return NextResponse.json({ success: false, error: 'Provide a generated plan to validate.' }, { status: 400 });
  }
  try {
    validateMeasurementPlan(body.plan);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Invalid plan: ${(err as Error)?.message ?? 'unknown shape'}` },
      { status: 400 }
    );
  }
  const plan = body.plan as MeasurementPlan;

  // Operator-gated property — anonymous callers can't read the operator's metrics.
  let propertyId: string | undefined;
  if (await isOperatorRequest(req)) {
    if (typeof body.ga4?.propertyId === 'string' && body.ga4.propertyId.trim()) {
      propertyId = body.ga4.propertyId.trim();
    }
  }

  if (!propertyId) {
    return NextResponse.json({ success: true, propertyChecked: false, results: [] }, { headers: rateLimitHeaders(rl) });
  }

  // Validate each key event's daily eventCount, scoped to this owner's history
  // (Stage 3). One event failing to validate never aborts the others.
  const ownerId = await resolveOwnerId(req);
  const keyEvents = plan.events.filter((e) => e.isKeyEvent);
  const results: MetricHealthEntry[] = [];
  for (const ev of keyEvents) {
    try {
      const r = await validateMetrics({ userId: ownerId, propertyId, metricName: 'eventCount', dimensionValue: ev.name });
      results.push({ eventName: ev.name, ...r });
    } catch (err) {
      results.push({
        eventName: ev.name,
        verdict: 'inconclusive',
        daysObserved: 0,
        summary: (err as Error)?.message || 'Could not validate this event.',
      });
    }
  }

  return NextResponse.json({ success: true, propertyChecked: true, results }, { headers: rateLimitHeaders(rl) });
}
