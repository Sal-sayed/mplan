// metric-analysis-store.ts — READ-ONLY access to the Python statistical tier's
// output (metric_analysis). Mirrors metric-store's graceful pattern: a lazily-created
// Supabase service-role client; if Supabase is unconfigured OR the table doesn't
// exist yet, reads degrade to [] and NEVER throw (so the Metric Health screen is
// never dead-ended by the preliminary tier).
//
// This tier is PRELIMINARY and NOT validated on real data — every row carries
// validated:false + confidence 'low' + weeks_of_data + caveats. The store does not
// write (the Python cron does); it only surfaces the latest analysis per series.
//
// The Supabase table is created by hand (see scripts/sql/metric_analysis.sql).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'metric_analysis';

// The contract the Python tier writes, in camelCase for the UI/TS side.
export interface MetricAnalysis {
  userId: string;
  propertyId: string;
  metricName: string;
  dimensionValue: string;
  changepointDetected: boolean;
  changepointDate: string | null; // 'YYYY-MM-DD' | null
  trend: 'up' | 'down' | 'flat';
  trendSlope: number;
  weeksOfData: number;
  confidence: string; // capped 'low' this slice
  validated: boolean; // false this slice
  verdict: string | null;
  caveats: string[];
  analyzedAt: string; // ISO 8601
}

interface MetricAnalysisRow {
  user_id: string;
  property_id: string;
  metric_name: string;
  dimension_value: string;
  changepoint_detected: boolean;
  changepoint_date: string | null;
  trend: string;
  trend_slope: number;
  weeks_of_data: number;
  confidence: string;
  validated: boolean;
  verdict: string | null;
  caveats: unknown;
  analyzed_at: string;
}

function rowToAnalysis(r: MetricAnalysisRow): MetricAnalysis {
  const trend = r.trend === 'up' || r.trend === 'down' ? r.trend : 'flat';
  return {
    userId: r.user_id,
    propertyId: r.property_id,
    metricName: r.metric_name,
    dimensionValue: r.dimension_value ?? '',
    changepointDetected: Boolean(r.changepoint_detected),
    changepointDate: r.changepoint_date ?? null,
    trend,
    trendSlope: Number(r.trend_slope ?? 0),
    weeksOfData: Number(r.weeks_of_data ?? 0),
    confidence: r.confidence ?? 'low',
    validated: Boolean(r.validated), // honest default — preliminary until proven
    verdict: r.verdict ?? null,
    caveats: Array.isArray(r.caveats) ? (r.caveats as string[]) : [],
    analyzedAt: r.analyzed_at,
  };
}

let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

export interface AnalysisQuery {
  userId: string; // REQUIRED owner scope — same gate as the metric history read
  propertyId: string;
}

// Latest analysis per (metric_name, dimension_value) series for one owner+property.
// Rows are append-only (analyzed_at is part of the PK); we keep the newest per
// series. Returns [] on any failure (unconfigured / missing table / query error) —
// never throws, so it's safe to call before the table is created.
export async function getLatestAnalyses(q: AnalysisQuery): Promise<MetricAnalysis[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select(
        'user_id, property_id, metric_name, dimension_value, changepoint_detected, changepoint_date, trend, trend_slope, weeks_of_data, confidence, validated, verdict, caveats, analyzed_at'
      )
      .eq('user_id', q.userId)
      .eq('property_id', q.propertyId)
      .order('analyzed_at', { ascending: false });
    if (error) throw error;
    const seen = new Set<string>();
    const latest: MetricAnalysis[] = [];
    for (const r of (data as MetricAnalysisRow[]) ?? []) {
      const key = `${r.metric_name}::${r.dimension_value ?? ''}`;
      if (seen.has(key)) continue; // ordered desc → first seen is the latest
      seen.add(key);
      latest.push(rowToAnalysis(r));
    }
    return latest;
  } catch (err) {
    console.warn('[metric-analysis-store] read failed (preliminary tier — non-fatal):', (err as Error)?.message);
    return [];
  }
}
