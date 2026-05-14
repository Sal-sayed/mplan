import { NextRequest, NextResponse } from 'next/server';
import { deepScrapeWebsite } from '@/lib/scraper';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const data = await deepScrapeWebsite(url);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to analyze website';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
