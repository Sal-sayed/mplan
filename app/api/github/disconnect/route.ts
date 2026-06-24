// POST /api/github/disconnect — clears the caller's OWN stored GitHub token.
// Mirrors /api/google/disconnect.

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { clearTokens } from '@/lib/github/token-store';

export async function POST(req: NextRequest) {
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await clearTokens(ownerId);
  return NextResponse.json({ success: true });
}
