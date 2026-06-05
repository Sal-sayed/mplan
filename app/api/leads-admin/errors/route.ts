import { NextResponse } from 'next/server';
import { getUnresolvedErrors } from '@/lib/critical-errors';

export async function GET() {
  try {
    const errors = await getUnresolvedErrors();
    return NextResponse.json({ errors, total: errors.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load errors';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
