// POST /api/google/disconnect — admin-only. Clears the stored Google tokens.

import { NextRequest, NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/auth';
import { clearTokens } from '@/lib/google/token-store';

export async function POST(req: NextRequest) {
  if (!(await isOperatorRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await clearTokens();
  return NextResponse.json({ success: true });
}
