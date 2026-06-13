// metric-store.ts — GA4 metric time-series persistence. Mirrors governance-store
// (and leads-store): a lazily-created Supabase service-role client with an
// append-only local-JSON fallback. This accumulates daily metric values so the
// threshold validator (and, later, a statistical service) can judge metrics
// OVER TIME — governance_runs holds config verdicts, never metric values.
//
// DURABILITY: on Render the local data/ file is EPHEMERAL — **Supabase is the
// only durable store**; the local file is dev-only scratch. If Supabase is
// unconfigured, persistence degrades to a no-op (saveMetrics) / empty
// (getMetricHistory) and NEVER throws, so a scheduled fetch is never dead-ended.
//
// The Supabase table is created by hand (NOT from code):
//   ga4_metric_daily(property_id text, metric_name text, dimension_value text,
//                    date date, value numeric, fetched_at timestamptz,
//                    primary key (property_id, metric_name, dimension_value, date))

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const TABLE = 'ga4_metric_daily';
// Stage 3: user_id is part of the conflict key (and the table PK — see the
// Stage-3 migration) so two owners' rows for the same property/date COEXIST
// rather than overwriting each other.
const ON_CONFLICT = 'user_id,property_id,metric_name,dimension_value,date';
// Owner for local-scratch / pre-backfill rows lacking a user_id (the Stage-0
// backfill value).
const LEGACY_OWNER = 'admin';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'ga4-metric-daily.json');

export interface Ga4MetricDaily {
  propertyId: string;
  metricName: string;
  // '' (empty string, never null) when there's no dimension breakdown — keeps
  // the composite primary key total.
  dimensionValue: string;
  date: string; // 'YYYY-MM-DD'
  value: number;
  fetchedAt: string; // ISO 8601
  // Owner. Stage-0 ownership scaffolding only — ADDITIVE and UNUSED: nothing
  // reads, writes, or filters by it yet (no query change this stage). Maps to the
  // ga4_metric_daily.user_id column added by the Stage-0 migration.
  user_id?: string;
}

interface Ga4MetricRow {
  property_id: string;
  metric_name: string;
  dimension_value: string;
  date: string;
  value: number;
  fetched_at: string;
  user_id: string | null;
}

function toRow(m: Ga4MetricDaily): Ga4MetricRow {
  return {
    property_id: m.propertyId,
    metric_name: m.metricName,
    dimension_value: m.dimensionValue,
    date: m.date,
    value: m.value,
    fetched_at: m.fetchedAt,
    user_id: m.user_id ?? null,
  };
}

function rowToMetric(r: Ga4MetricRow): Ga4MetricDaily {
  return {
    propertyId: r.property_id,
    metricName: r.metric_name,
    dimensionValue: r.dimension_value,
    date: r.date,
    value: Number(r.value),
    fetchedAt: r.fetched_at,
    user_id: r.user_id ?? undefined,
  };
}

const pkOf = (m: Ga4MetricDaily) => `${m.propertyId}::${m.metricName}::${m.dimensionValue}::${m.date}`;

// ─── Supabase client (nullable — graceful degrade when unconfigured) ───
let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

// ─── Local-file fallback (dev scratch, upsert-by-PK — NOT durable on Render) ───
async function readLocalMetrics(): Promise<Ga4MetricDaily[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as Ga4MetricDaily[]) : [];
  } catch {
    return [];
  }
}

async function upsertLocalMetrics(rows: Ga4MetricDaily[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  const existing = await readLocalMetrics();
  const byPk = new Map(existing.map((m) => [pkOf(m), m]));
  for (const m of rows) byPk.set(pkOf(m), m); // PK upsert — last write wins
  await fs.writeFile(LOCAL_FILE, JSON.stringify([...byPk.values()], null, 2));
}

function byDateAsc(a: Ga4MetricDaily, b: Ga4MetricDaily): number {
  return (a.date || '').localeCompare(b.date || '');
}

// ─── Public API ───

// Append/upsert metric rows (idempotent on the composite PK). Never throws: the
// dev-scratch write and the Supabase upsert are both best-effort, so a scheduled
// fetch is never dead-ended by a storage problem.
export async function saveMetrics(rows: Ga4MetricDaily[]): Promise<void> {
  if (rows.length === 0) return;

  try {
    await upsertLocalMetrics(rows);
  } catch (err) {
    console.warn('[metric-store] local upsert failed:', (err as Error)?.message);
  }

  const sb = getSupabase();
  if (!sb) return; // unconfigured → no-op (dev scratch only)
  try {
    const { error } = await sb.from(TABLE).upsert(rows.map(toRow), { onConflict: ON_CONFLICT });
    if (error) throw error;
  } catch (err) {
    console.warn('[metric-store] Supabase upsert failed:', (err as Error)?.message);
  }
}

export interface MetricHistoryQuery {
  // REQUIRED owner scope (Stage 3) — a history read is always for one user, so a
  // missing filter can't leak another user's metrics.
  userId: string;
  propertyId: string;
  metricName: string;
  dimensionValue?: string; // omit to span all dimension values for the metric
  sinceDate?: string; // 'YYYY-MM-DD' inclusive lower bound
}

// Metric history for a (property, metric[, dimension]) ordered by date ascending,
// so a trailing window is the tail. Supabase is the source of truth; falls back
// to the dev-scratch file. Returns [] (never throws) on any storage failure.
export async function getMetricHistory(q: MetricHistoryQuery): Promise<Ga4MetricDaily[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      let query = sb
        .from(TABLE)
        .select('property_id, metric_name, dimension_value, date, value, fetched_at, user_id')
        .eq('user_id', q.userId)
        .eq('property_id', q.propertyId)
        .eq('metric_name', q.metricName);
      if (q.dimensionValue !== undefined) query = query.eq('dimension_value', q.dimensionValue);
      if (q.sinceDate) query = query.gte('date', q.sinceDate);
      const { data, error } = await query.order('date', { ascending: true });
      if (error) throw error;
      if (data) return (data as Ga4MetricRow[]).map(rowToMetric);
      return [];
    } catch (err) {
      console.warn('[metric-store] getMetricHistory Supabase failed, trying local:', (err as Error)?.message);
    }
  }

  return (await readLocalMetrics())
    .filter(
      (m) =>
        (m.user_id ?? LEGACY_OWNER) === q.userId &&
        m.propertyId === q.propertyId &&
        m.metricName === q.metricName &&
        (q.dimensionValue === undefined || m.dimensionValue === q.dimensionValue) &&
        (!q.sinceDate || (m.date || '') >= q.sinceDate)
    )
    .sort(byDateAsc);
}
