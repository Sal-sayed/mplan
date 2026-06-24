// GET /api/github/status — whether GitHub OAuth is configured on the server and
// whether the CALLER'S OWN account is connected (signed-in user's, the admin's, or
// none for an anonymous non-admin). Mirrors /api/google/status.

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { isConfigured } from '@/lib/github/oauth';
import { getStatus } from '@/lib/github/token-store';

export async function GET(req: NextRequest) {
  const configured = isConfigured();
  const ownerId = await resolveConnectOwnerId(req);

  if (!ownerId) {
    return NextResponse.json({ configured, connected: false });
  }

  let connected = false;
  let login: string | undefined;
  let expiresAt: string | undefined;
  if (configured) {
    try {
      const s = await getStatus(ownerId);
      connected = s.connected;
      login = s.login;
      expiresAt = s.expiresAt;
    } catch {
      /* treat as not connected */
    }
  }

  return NextResponse.json({ configured, connected, login, expiresAt });
}
