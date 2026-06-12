/* eslint-disable @typescript-eslint/no-explicit-any */
// GA4 Data API reader (analyticsdata runReport). Sibling of ga4-config.ts: raw
// fetch (no SDK), read-only, uses an access token from token-store. The Data API
// requires the SAME scope the connected token already holds (analytics.readonly)
// — no new scope, no re-consent. This reads METRICS over time (e.g. eventCount by
// date + eventName) to feed the metric-history store; the Admin reader
// (ga4-config.ts) reads CONFIG. Auth + error handling mirror ga4Get exactly.

const GA4_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export interface Ga4DateRange {
  startDate: string; // 'YYYY-MM-DD' or relative ('7daysAgo', 'yesterday', 'today')
  endDate: string;
}

export interface Ga4ReportRequest {
  propertyId: string;
  metrics: string[]; // e.g. ['eventCount']
  dimensions?: string[]; // e.g. ['date', 'eventName']
  dateRange: Ga4DateRange;
}

export interface Ga4ReportRow {
  dimensionValues: string[]; // positional, aligned to dimensionHeaders
  metricValues: string[]; // positional, aligned to metricHeaders
}

export interface Ga4ReportResult {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: Ga4ReportRow[];
}

// Accepts "properties/123456789", "123456789", or a value with surrounding text
// — same normalization as ga4-config.ts.
function normalizePropertyId(input: string): string {
  const trimmed = input.trim().replace(/^properties\//i, '');
  const m = trimmed.match(/\d{4,}/);
  return m ? m[0] : trimmed;
}

async function ga4Post(path: string, body: unknown, accessToken: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GA4_DATA_BASE}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function runGa4Report(req: Ga4ReportRequest, accessToken: string): Promise<Ga4ReportResult> {
  const id = normalizePropertyId(req.propertyId);
  const body = {
    dimensions: (req.dimensions ?? []).map((name) => ({ name })),
    metrics: req.metrics.map((name) => ({ name })),
    dateRanges: [{ startDate: req.dateRange.startDate, endDate: req.dateRange.endDate }],
  };

  const r = await ga4Post(`properties/${id}:runReport`, body, accessToken);
  if (r.status === 401) throw new Error('Google authorization expired or invalid — reconnect Google.');
  if (r.status === 403) throw new Error('Your connected Google account does not have access to this GA4 property.');
  if (r.status === 404) return { dimensionHeaders: [], metricHeaders: [], rows: [] };
  if (r.status !== 200) {
    throw new Error(`GA4 Data API error (${r.status}): ${r.json?.error?.message || 'unknown'}`);
  }

  const dimensionHeaders: string[] = Array.isArray(r.json?.dimensionHeaders)
    ? r.json.dimensionHeaders.map((h: any) => h.name).filter(Boolean)
    : [];
  const metricHeaders: string[] = Array.isArray(r.json?.metricHeaders)
    ? r.json.metricHeaders.map((h: any) => h.name).filter(Boolean)
    : [];
  const rows: Ga4ReportRow[] = Array.isArray(r.json?.rows)
    ? r.json.rows.map((row: any) => ({
        dimensionValues: Array.isArray(row.dimensionValues) ? row.dimensionValues.map((v: any) => v?.value ?? '') : [],
        metricValues: Array.isArray(row.metricValues) ? row.metricValues.map((v: any) => v?.value ?? '') : [],
      }))
    : [];

  return { dimensionHeaders, metricHeaders, rows };
}
