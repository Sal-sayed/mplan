// POST /api/implementation/create-ga4 — create a BRAND-NEW GA4 property + web data
// stream for the site, returning the new property id and Measurement ID (G-XXXX).
//
// Creation only — never edits/deletes existing properties. Needs the caller's own
// analytics.edit-scoped token (the "Connect for write" consent, which now also
// requests analytics.edit). Owner-gated like the other Google routes. The returned
// Measurement ID then feeds the GTM container's GA4 tags.
//
// Body: { plan, accountId?, displayName?, timeZone?, currencyCode? }
//  → 200 { success, result }
//  → 409 { needsWriteConnect } if the grant lacks analytics.edit
//  → 409 { needsAccount, accounts } if the user has >1 GA4 account and didn't pick

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { validateMeasurementPlan } from '@/lib/measurement/generate-plan';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getStatus, getValidAccessToken } from '@/lib/google/token-store';
import { ANALYTICS_WRITE_SCOPE } from '@/lib/google/oauth';
import { createGa4Property, NeedsAccountSelection } from '@/lib/measurement/ga4-provision';
import type { MeasurementPlan } from '@/lib/measurement/types';

export const maxDuration = 60; // a couple of GA4 Admin write calls — no browser

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getClientIdentifier(req));
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ success: false, error: 'Sign in to create a GA4 property.' }, { status: 401 });
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

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() : '';
  const currencyCode = typeof body.currencyCode === 'string' ? body.currencyCode.trim() : '';

  // Require the WRITE grant with analytics.edit (read-only users must reconnect).
  const status = await getStatus(ownerId);
  if (!status.connected || !status.scopes?.includes(ANALYTICS_WRITE_SCOPE)) {
    return NextResponse.json(
      { success: false, error: 'Connect Google for write access first (this grant cannot edit Analytics).', needsWriteConnect: true },
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
    const result = await createGa4Property({
      plan: body.plan as MeasurementPlan,
      token,
      accountId: accountId || undefined,
      displayName: displayName || undefined,
      timeZone: timeZone || undefined,
      currencyCode: currencyCode || undefined,
    });
    return NextResponse.json({ success: true, result }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    if (err instanceof NeedsAccountSelection || (err as { needsAccount?: boolean })?.needsAccount) {
      return NextResponse.json(
        { success: false, needsAccount: true, accounts: (err as NeedsAccountSelection).accounts },
        { status: 409, headers: rateLimitHeaders(rl) }
      );
    }
    return NextResponse.json({ success: false, error: (err as Error)?.message || 'Create GA4 property failed.' }, { status: 500, headers: rateLimitHeaders(rl) });
  }
}
