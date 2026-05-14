import { NextResponse } from 'next/server';
import { getLeads } from '@/lib/leads-store';

export async function GET() {
  try {
    const leads = await getLeads();

    return NextResponse.json({
      leads,
      total: leads.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load leads';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
