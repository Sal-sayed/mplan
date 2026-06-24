// POST /api/implementation/create-container — Phase B, container-creation variant.
//
// Creates a BRAND-NEW GTM web container under the user's Tag Manager account and
// populates it (dataLayer variables + triggers, plus GA4 event tags if a
// Measurement ID is supplied) in a NEW, UNPUBLISHED workspace. It does NOT publish
// and does NOT create a container version — the user reviews + publishes in GTM.
// Returns the new GTM-XXXX so it can feed the slice-1 GitHub injection.
//
// Needs the caller's own write-scoped token (the "Connect for write" consent,
// tagmanager.edit.containers). Owner-gated like the other Google routes.
//
// Body: { plan, accountId?, containerName?, measurementId? }
//  → 200 { success, result }
//  → 409 { needsWriteConnect } if the grant is read-only
//  → 409 { needsAccount, accounts } if the user has >1 GTM account and didn't pick

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getStatus, getValidAccessToken } from '@/lib/google/token-store';
import { GTM_WRITE_SCOPE } from '@/lib/google/oauth';
import { createContainerAndApply, NeedsAccountSelection } from '@/lib/measurement/gtm-apply';
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
    return NextResponse.json({ success: false, error: 'Sign in to create a GTM container.' }, { status: 401 });
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

  // measurementId is OPTIONAL here (GTM-only creation); validate only if present.
  const measurementId = typeof body.measurementId === 'string' ? body.measurementId.trim() : '';
  if (measurementId && !/^G-[A-Z0-9]+$/i.test(measurementId)) {
    return NextResponse.json({ success: false, error: 'GA4 Measurement ID must look like G-XXXXXXX (or leave it blank).' }, { status: 400 });
  }
  const containerName = typeof body.containerName === 'string' ? body.containerName.trim() : '';
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';

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
    const result = await createContainerAndApply({
      plan: body.plan as MeasurementPlan,
      token,
      accountId: accountId || undefined,
      containerName: containerName || undefined,
      measurementId: measurementId || undefined,
    });
    return NextResponse.json({ success: true, result }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    // Multiple GTM accounts and none chosen — ask the UI to pick one.
    if (err instanceof NeedsAccountSelection || (err as { needsAccount?: boolean })?.needsAccount) {
      return NextResponse.json(
        { success: false, needsAccount: true, accounts: (err as NeedsAccountSelection).accounts },
        { status: 409, headers: rateLimitHeaders(rl) }
      );
    }
    return NextResponse.json({ success: false, error: (err as Error)?.message || 'Create container failed.' }, { status: 500, headers: rateLimitHeaders(rl) });
  }
}
