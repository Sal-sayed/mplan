// POST /api/google/disconnect — admin-only. Clears the stored Google tokens.

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { clearTokens } from '@/lib/google/token-store';

export async function POST(req: NextRequest) {
  // Disconnect only the caller's OWN Google token (Stage 4).
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await clearTokens(ownerId);
  return NextResponse.json({ success: true });
}
