// GET /api/github/repos — the caller's repositories, for the one-repo picker.
// Signed-in + connected only. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { resolveConnectOwnerId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/github/token-store';
import { listRepos } from '@/lib/github/repo';

export async function GET(req: NextRequest) {
  const ownerId = await resolveConnectOwnerId(req);
  if (!ownerId) {
    return NextResponse.json({ error: 'Sign in to list your GitHub repositories.' }, { status: 401 });
  }
  try {
    const token = await getValidAccessToken(ownerId);
    const repos = await listRepos(token);
    return NextResponse.json({ repos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'Could not list repositories.' }, { status: 502 });
  }
}
