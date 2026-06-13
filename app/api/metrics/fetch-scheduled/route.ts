// POST /api/metrics/fetch-scheduled — machine-to-machine metric collector.
//
// STARTS THE DATA CLOCK: for each persisted site that has a GA4 property, it runs
// a GA4 Data API report for a recent window and appends the rows to metric
// history. Unattended (a cron has no operator session), so it's gated by
// MONITOR_SECRET — the SAME timing-safe pattern as /api/governance/run-scheduled,
// not the public operator gate. The Google token is the global single-operator
// token from token-store (the same scope already covers Data API reads).
//
// Body (optional): { propertyIds?: string[] } to restrict; omitted → every
// persisted property. Returns: { success, results: MetricFetchResult[] }.
//
// Per-property isolation: one property's fetch/store failure is recorded and
// never aborts the others.

import { NextRequest, NextResponse } from 'next/server';
import { listLatestRuns } from '@/lib/measurement/governance-store';
import { getValidAccessToken } from '@/lib/google/token-store';
import { runGa4Report } from '@/lib/measurement/ga4-data';
import { saveMetrics, type Ga4MetricDaily } from '@/lib/measurement/metric-store';

export const maxDuration = 60; // config-only Data API fan-out — no browser capture

// Key-event coverage by day: eventCount split by eventName over a short trailing
// window (re-pulled each run so late-arriving data self-corrects on the PK).
const METRICS = ['eventCount'];
const DIMENSIONS = ['date', 'eventName'];
const DATE_RANGE = { startDate: '3daysAgo', endDate: 'yesterday' }; // 'today' is incomplete in GA4

function secretMatches(provided: string, secret: string): boolean {
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.MONITOR_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const headerSecret = req.headers.get('x-monitor-secret') ?? '';
  return secretMatches(bearer || headerSecret, secret);
}

// GA4 'date' dimension is 'YYYYMMDD' — normalize to the 'YYYY-MM-DD' date column.
function toIsoDate(yyyymmdd: string): string {
  const m = yyyymmdd.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : yyyymmdd;
}

interface MetricFetchResult {
  propertyId: string;
  rowsSaved?: number;
  skipped?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.MONITOR_SECRET) {
    return NextResponse.json({ success: false, error: 'MONITOR_SECRET is not configured on the server.' }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const restrict: string[] | null = Array.isArray(body?.propertyIds)
    ? body.propertyIds.filter((p: unknown): p is string => typeof p === 'string')
    : null;

  // Unique GA4 properties across persisted governance runs, each mapped to the
  // owner of the run that registered it (Stage 2 — metrics carry that user_id).
  let properties: string[];
  const ownerByProperty = new Map<string, string>();
  try {
    const persisted = await listLatestRuns();
    for (const r of persisted) {
      const pid = r.connectors?.ga4?.propertyId;
      if (pid && (!restrict || restrict.includes(pid)) && !ownerByProperty.has(pid)) {
        ownerByProperty.set(pid, r.user_id ?? 'admin');
      }
    }
    properties = [...ownerByProperty.keys()];
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error)?.message || 'Failed to resolve properties' }, { status: 500 });
  }

  if (properties.length === 0) {
    return NextResponse.json({ success: true, results: [] });
  }

  // One global operator token for every property (single-operator model). If
  // Google isn't connected, skip gracefully — never crash the whole run.
  let token: string;
  try {
    token = await getValidAccessToken();
  } catch (err) {
    return NextResponse.json({
      success: true,
      results: properties.map((propertyId) => ({ propertyId, skipped: true, error: (err as Error)?.message || 'Google not connected' })),
    });
  }

  const fetchedAt = new Date().toISOString();
  const results: MetricFetchResult[] = [];
  for (const propertyId of properties) {
    try {
      const report = await runGa4Report({ propertyId, metrics: METRICS, dimensions: DIMENSIONS, dateRange: DATE_RANGE }, token);
      const dateIdx = report.dimensionHeaders.indexOf('date');
      const evtIdx = report.dimensionHeaders.indexOf('eventName');
      const valIdx = Math.max(0, report.metricHeaders.indexOf('eventCount'));

      const rows: Ga4MetricDaily[] = report.rows.map((row) => ({
        propertyId,
        metricName: 'eventCount',
        dimensionValue: evtIdx >= 0 ? row.dimensionValues[evtIdx] ?? '' : '',
        date: toIsoDate(dateIdx >= 0 ? row.dimensionValues[dateIdx] ?? '' : ''),
        value: Number(row.metricValues[valIdx] ?? 0) || 0,
        fetchedAt,
        user_id: ownerByProperty.get(propertyId) ?? 'admin',
      }));

      await saveMetrics(rows);
      results.push({ propertyId, rowsSaved: rows.length });
    } catch (err) {
      results.push({ propertyId, error: (err as Error)?.message || 'metric fetch failed' });
    }
  }

  return NextResponse.json({ success: true, results });
}
