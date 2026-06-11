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
