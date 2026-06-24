// GET /api/implementation/provision-status?url=<siteUrl> — CHECK what already
// exists for this site on the caller's connected Google account: GTM container,
// GA4 property (Meta is reported 'unknown' — not auto-checkable). Read-only; works
// with the read scopes the connection already has. Owner-gated.
//
// → 200 { success, connected, status } | { success, connected: false } if not connected

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/google/token-store';
import { checkProvisionStatus } from '@/lib/measurement/provision-check';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ success: false, error: 'Sign in to check your Google setup.' }, { status: 401 });
  }

  const url = new URL(req.url).searchParams.get('url')?.trim();
  if (!url) {
    return NextResponse.json({ success: false, error: 'A site url is required.' }, { status: 400 });
  }

  let token: string;
  try {
    token = await getValidAccessToken(ownerId);
  } catch {
    // Not connected to Google yet — the UI just won't show existence info.
    return NextResponse.json({ success: true, connected: false });
  }

  try {
    const status = await checkProvisionStatus(url, token);
    return NextResponse.json({ success: true, connected: true, status });
  } catch (err) {
    return NextResponse.json({ success: false, connected: true, error: (err as Error)?.message || 'Could not check your setup.' }, { status: 502 });
  }
}
