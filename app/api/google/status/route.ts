// GET /api/google/status — tells the readiness UI whether Google OAuth is
// configured on the server, whether a Google account is connected, and whether
// the current session is the admin/operator (only they may connect).

import { NextRequest, NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/auth';
import { isOAuthConfigured } from '@/lib/google/oauth';
import { getStatus } from '@/lib/google/token-store';

export async function GET(req: NextRequest) {
  const isAdmin = await isOperatorRequest(req);
  const configured = isOAuthConfigured();

  // Don't disclose the connection status (connected/scopes/expiry) to non-operators
  // — only the operator may connect, so only they need it. `configured` (whether
  // the feature is set up server-side) is not sensitive and stays for all callers.
  if (!isAdmin) {
    return NextResponse.json({ configured, connected: false, isAdmin: false });
  }

  let connected = false;
  let scopes: string[] | undefined;
  let expiresAt: string | undefined;
  if (configured) {
    try {
      const s = await getStatus();
      connected = s.connected;
      scopes = s.scopes;
      expiresAt = s.expiresAt;
    } catch {
      /* treat as not connected */
    }
  }

  return NextResponse.json({ configured, connected, isAdmin, scopes, expiresAt });
}
