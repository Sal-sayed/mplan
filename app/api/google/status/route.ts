// GET /api/google/status — tells the readiness UI whether Google OAuth is
// configured on the server, whether a Google account is connected, and whether
// the current session is the admin/operator (only they may connect).

import { NextRequest, NextResponse } from 'next/server';
import { isOperatorRequest, resolveConnectOwnerId } from '@/lib/auth';
import { isOAuthConfigured } from '@/lib/google/oauth';
import { getStatus } from '@/lib/google/token-store';

export async function GET(req: NextRequest) {
  const isAdmin = await isOperatorRequest(req);
  const configured = isOAuthConfigured();
  // The caller's OWN connection (Stage 4): a signed-in user's, the admin's, or
  // none for an anonymous non-admin. isAdmin is kept for the existing readiness UI.
  const ownerId = await resolveConnectOwnerId(req);

  if (!ownerId) {
    return NextResponse.json({ configured, connected: false, isAdmin });
  }

  let connected = false;
  let scopes: string[] | undefined;
  let expiresAt: string | undefined;
  if (configured) {
    try {
      const s = await getStatus(ownerId);
      connected = s.connected;
      scopes = s.scopes;
      expiresAt = s.expiresAt;
    } catch {
      /* treat as not connected */
    }
  }

  return NextResponse.json({ configured, connected, isAdmin, scopes, expiresAt });
}
