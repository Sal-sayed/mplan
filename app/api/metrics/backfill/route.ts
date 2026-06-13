// POST /api/metrics/backfill — one-time, user-triggered historical metric pull.
//
// Separate from the daily MONITOR_SECRET cron (/api/metrics/fetch-scheduled): this
// is an OPERATOR action from the UI that fetches a CHOSEN date range from GA4 and
// appends it to metric history, so validateMetrics has a real baseline instead of
// "0 days of history". Reuses the same reader (runGa4Report), the same store
// (saveMetrics), the same operator gate as /api/metrics/validate, and the same
// (date × eventName → eventCount) shape as the collector. Does NOT touch the cron.
//
// Body: { ga4: { propertyId }, startDate, endDate }  (YYYY-MM-DD)
// Returns: { success, rowsSaved, range } | { success:false, error }.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { isOperatorRequest, resolveOwnerId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/google/token-store';
import { runGa4Report } from '@/lib/measurement/ga4-data';
import { saveMetrics, type Ga4MetricDaily } from '@/lib/measurement/metric-store';

export const maxDuration = 60; // a date-range Data API read — no browser

const METRICS = ['eventCount'];
const DIMENSIONS = ['date', 'eventName'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// GA4 runReport returns up to 10k rows per request; cap the span so a single
// backfill (days × events) stays well under that. Longer history → multiple runs.
const MAX_SPAN_DAYS = 400;

// GA4 'date' dimension is 'YYYYMMDD' — normalize to the 'YYYY-MM-DD' date column.
function toIsoDate(yyyymmdd: string): string {
  const m = yyyymmdd.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : yyyymmdd;
}

export async function POST(req: NextRequest) {
  const clientId = getClientIdentifier(req);
  const rl = await checkRateLimit(clientId);
  if (!rl.allowed) {
    const resetMinutes = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000 / 60));
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Try again in ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.` },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  // Operator-only — this reads the operator's Google token and writes history.
  if (!(await isOperatorRequest(req))) {
    return NextResponse.json({ success: false, error: 'Sign in as the operator to backfill metrics.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  const propertyId = typeof body?.ga4?.propertyId === 'string' ? body.ga4.propertyId.trim() : '';
  if (!propertyId) {
    return NextResponse.json({ success: false, error: 'Provide a GA4 property id (ga4.propertyId).' }, { status: 400 });
  }

  const startDate = typeof body?.startDate === 'string' ? body.startDate.trim() : '';
  const endDate = typeof body?.endDate === 'string' ? body.endDate.trim() : '';
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ success: false, error: 'startDate and endDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return NextResponse.json({ success: false, error: 'Invalid start or end date.' }, { status: 400 });
  }
  if (startMs > endMs) {
    return NextResponse.json({ success: false, error: 'startDate must be on or before endDate.' }, { status: 400 });
  }
  if ((endMs - startMs) / 86_400_000 > MAX_SPAN_DAYS) {
    return NextResponse.json({ success: false, error: `Range too large — keep it within ${MAX_SPAN_DAYS} days per backfill.` }, { status: 400 });
  }

  // Stage 4: this owner's own Google token (same scope reads the Data API), and
  // the owner the rows are attributed to. If they haven't connected Google, say so.
  const ownerId = await resolveOwnerId(req);
  let token: string;
  try {
    token = await getValidAccessToken(ownerId);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error)?.message || 'Connect Google to backfill metrics.' },
      { status: 409, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const report = await runGa4Report({ propertyId, metrics: METRICS, dimensions: DIMENSIONS, dateRange: { startDate, endDate } }, token);
    const dateIdx = report.dimensionHeaders.indexOf('date');
    const evtIdx = report.dimensionHeaders.indexOf('eventName');
    const valIdx = Math.max(0, report.metricHeaders.indexOf('eventCount'));
    const fetchedAt = new Date().toISOString();

    const rows: Ga4MetricDaily[] = report.rows.map((row) => ({
      propertyId,
      metricName: 'eventCount',
      dimensionValue: evtIdx >= 0 ? row.dimensionValues[evtIdx] ?? '' : '',
      date: toIsoDate(dateIdx >= 0 ? row.dimensionValues[dateIdx] ?? '' : ''),
      value: Number(row.metricValues[valIdx] ?? 0) || 0,
      fetchedAt,
      user_id: ownerId,
    }));

    await saveMetrics(rows);
    return NextResponse.json(
      { success: true, rowsSaved: rows.length, range: { startDate, endDate } },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error)?.message || 'Backfill failed.' },
      { status: 500, headers: rateLimitHeaders(rl) }
    );
  }
}
