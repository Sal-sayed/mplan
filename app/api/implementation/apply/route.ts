// POST /api/implementation/apply — Phase B (write to an UNPUBLISHED GTM workspace).
//
// Creates the plan's dataLayer variables, triggers, and GA4 event tags in a NEW
// workspace and STOPS — it does NOT publish or create a container version. Needs
// the caller's own write-scoped token (the separate "Connect for write" consent,
// tagmanager.edit.containers). Owner-gated like the other Google routes. The user
// reviews the workspace in GTM and publishes there.
//
// Body: { plan, gtm: { containerId }, measurementId } → { success, result }.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getStatus, getValidAccessToken } from '@/lib/google/token-store';
import { GTM_WRITE_SCOPE } from '@/lib/google/oauth';
import { applyPlanToGtm } from '@/lib/measurement/gtm-apply';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 60; // several GTM write calls — no browser

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getClientIdentifier(req));
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Owner-gated: only a signed-in user (or admin) using THEIR OWN write grant.
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ success: false, error: 'Sign in to apply to GTM.' }, { status: 401 });
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

  const containerId = typeof body.gtm?.containerId === 'string' ? body.gtm.containerId.trim() : '';
  const measurementId = typeof body.measurementId === 'string' ? body.measurementId.trim() : '';
  if (!/^GTM-[A-Z0-9]+$/i.test(containerId)) {
    return NextResponse.json({ success: false, error: 'Provide a GTM container id (GTM-XXXXXXX).' }, { status: 400 });
  }
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    return NextResponse.json({ success: false, error: 'Provide a GA4 Measurement ID (G-XXXXXXX) for the tags.' }, { status: 400 });
  }
  const metaPixelId = typeof body.metaPixelId === 'string' ? body.metaPixelId.trim() : '';
  if (metaPixelId && !/^\d{10,20}$/.test(metaPixelId)) {
    return NextResponse.json({ success: false, error: 'Meta Pixel ID must be the numeric id (or leave it blank).' }, { status: 400 });
  }

  // Require the WRITE grant specifically (read-only users must "Connect for write").
  const status = await getStatus(ownerId);
  if (!status.connected || !status.scopes?.includes(GTM_WRITE_SCOPE)) {
    return NextResponse.json(
      { success: false, error: 'Connect Google for write access first (this grant is read-only).', needsWriteConnect: true },
      { status: 409, headers: rateLimitHeaders(rl) }
    );
  }

  let token: string;
  try {
    token = await getValidAccessToken(ownerId);
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error)?.message || 'Google not connected.' }, { status: 409, headers: rateLimitHeaders(rl) });
  }

  try {
    const result = await applyPlanToGtm({ plan: body.plan as MeasurementPlan, containerId, measurementId, metaPixelId: metaPixelId || undefined, token });
    return NextResponse.json({ success: true, result }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error)?.message || 'Apply to GTM failed.' }, { status: 500, headers: rateLimitHeaders(rl) });
  }
}
