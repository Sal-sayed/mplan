/**
 * POST /api/audit-existing-site
 *
 * Scrapes a live website's GA4/GTM setup, compares against recommended events,
 * and emails the audit report.
 *
 * Body: { url: string, recipientEmail: string, recommendedEvents: [{ name, priority, description }] }
 * Returns: { ok: true, scrapeReport, diff, email } or { ok: false, error }
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, recipientEmail, recommendedEvents } = body;

    // Validate
    if (!url || !url.match(/^https?:\/\//)) {
      return NextResponse.json({ ok: false, error: 'URL must start with http:// or https://' }, { status: 400 });
    }
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 });
    }
    if (!Array.isArray(recommendedEvents) || recommendedEvents.length === 0) {
      return NextResponse.json({ ok: false, error: 'recommendedEvents array required' }, { status: 400 });
    }

    // Auto-derive site name from URL hostname
    const siteName = new URL(url).hostname.replace(/^www\./, '');

    // Dynamic imports (these are CommonJS modules)
    const { scrapeGA4Events, diffAgainstPlan } = require('@/lib/scrapeGA4Events');
    const { sendReportEmail } = require('@/lib/sendReportEmail');

    // 1. Scrape
    const scrapeReport = await scrapeGA4Events(url, { timeout: 30000 });

    // 2. Diff against plan
    const diff = diffAgainstPlan(scrapeReport, recommendedEvents);

    // 3. Email report
    const emailResult = await sendReportEmail({
      to: recipientEmail,
      siteName,
      scrapeReport,
      diff,
    });

    return NextResponse.json({
      ok: true,
      scrapeReport,
      diff,
      email: {
        messageId: emailResult.messageId,
        accepted: emailResult.accepted,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Audit failed';
    console.error('Audit existing site error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
