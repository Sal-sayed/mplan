// /api/plans — saved-plan history for a signed-in user (Stage 5).
//
//   POST /api/plans          → save the posted plan to the caller's history.
//   GET  /api/plans          → list the caller's saved plans (summaries).
//   GET  /api/plans?id=...    → one saved plan's full MeasurementPlan.
//
// Owner-scoped: a request resolves to the SIGNED-IN user (no anonymous/admin
// default here — history is a per-user feature). A plan the caller doesn't own
// is invisible (404), never returned.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { getSessionUser } from '@/lib/auth';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { savePlan, getPlan, listPlansByUser, buildPlan } from '@/lib/measurement/plans-store';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getClientIdentifier(req));
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in to save plans.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.plan) {
    return NextResponse.json({ success: false, error: 'Provide a plan to save.' }, { status: 400 });
  }
  try {
    validateMeasurementPlan(body.plan);
  } catch (err) {
    return NextResponse.json({ success: false, error: `Invalid plan: ${(err as Error)?.message ?? 'unknown shape'}` }, { status: 400 });
  }

  const plan = body.plan as MeasurementPlan;
  const record = buildPlan({
    user_id: user.user_id,
    plan,
    site_url: plan.meta?.url ?? null,
    business_model: plan.meta?.businessModel ?? null,
  });
  await savePlan(record);
  return NextResponse.json({ success: true, id: record.id });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in to view your history.' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const record = await getPlan(id);
    // Ownership: a plan the caller doesn't own is invisible (don't reveal it exists).
    if (!record || record.user_id !== user.user_id) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, plan: record.plan }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const plans = await listPlansByUser(user.user_id);
  // Per-user data — never cache (HTTP caches key on URL, not the session cookie).
  return NextResponse.json(
    {
      success: true,
      plans: plans.map((p) => ({ id: p.id, site_url: p.site_url, business_model: p.business_model, created_at: p.created_at })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
