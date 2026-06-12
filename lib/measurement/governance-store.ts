// governance-store.ts — persistence for Measurement Governance runs.
//
// Mirrors lib/leads-store.ts / lib/google/token-store.ts: a lazily-created
// Supabase service-role client with an append-only local-JSON fallback. Stores
// one LaunchReadinessReport per run, keyed by (siteUrl, planKey), so a later run
// can diff against the latest prior run (drift detection).
//
// DURABILITY: on Render the local data/ file is EPHEMERAL (no persistent disk —
// it survives within a deploy, NOT across deploys). **Supabase is the only
// durable store.** The local file is dev-only scratch and must never be assumed
// durable in production. If Supabase is unconfigured, getSupabase() returns null
// and persistence degrades to that dev scratch only — it never throws, so a
// governance check is never dead-ended by a storage problem.
//
// The Supabase table is created by hand (NOT from code):
//   governance_runs(run_id text pk, site_url text, plan_key text,
//                   created_at timestamptz, decision text, report jsonb)
//   index on (site_url, plan_key, created_at desc)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';
import type { MeasurementPlan } from './types.ts';
import type { LaunchReadinessReport, LaunchDecision } from './launch-readiness.ts';

const TABLE = 'governance_runs';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'governance-runs.json');

// GA4/GTM identifiers used for a run's live checks. Persisted so an unattended
// re-run (the scheduler) can reproduce the same checks. The Google *token* is
// global (single-operator, via token-store) — only these per-site ids vary.
export interface GovernanceConnectors {
  ga4?: { propertyId: string };
  gtm?: { containerId: string };
}

export interface GovernanceRun {
  runId: string;
  siteUrl: string;
  planKey: string;
  createdAt: string; // ISO 8601
  decision: LaunchDecision;
  report: LaunchReadinessReport;
  // The plan + connectors that PRODUCED this report. Required for unattended
  // re-runs (a cron has no request body, so it reconstructs { plan, connectors }
  // from here). Optional on the type because rows written before the plan column
  // existed — and dev-scratch rows — may lack them; the scheduler skips a target
  // whose plan is missing rather than crashing.
  plan?: MeasurementPlan;
  connectors?: GovernanceConnectors;
}

// Row shape as stored in Supabase (snake_case columns).
//
// SCHEMA MIGRATION (run by hand once — this code never creates/alters the table):
//   alter table governance_runs add column if not exists plan jsonb;
//   alter table governance_runs add column if not exists connectors jsonb;
// Until those columns exist, inserts that carry a plan fail (caught + warned),
// so the scheduler has nothing to re-run — apply the migration before scheduling.
interface GovernanceRunRow {
  run_id: string;
  site_url: string;
  plan_key: string;
  created_at: string;
  decision: LaunchDecision;
  report: LaunchReadinessReport;
  plan: MeasurementPlan | null;
  connectors: GovernanceConnectors | null;
}

function runToRow(r: GovernanceRun): GovernanceRunRow {
  return {
    run_id: r.runId,
    site_url: r.siteUrl,
    plan_key: r.planKey,
    created_at: r.createdAt,
    decision: r.decision,
    report: r.report,
    plan: r.plan ?? null,
    connectors: r.connectors ?? null,
  };
}

function rowToRun(row: GovernanceRunRow): GovernanceRun {
  return {
    runId: row.run_id,
    siteUrl: row.site_url,
    planKey: row.plan_key,
    createdAt: row.created_at,
    decision: row.decision,
    report: row.report,
    plan: row.plan ?? undefined,
    connectors: row.connectors ?? undefined,
  };
}

// ─── Supabase client (nullable — graceful degrade when unconfigured) ───
let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

// ─── Deterministic plan identity ───
// Same plan (same site + business model) → same key across runs, so successive
// governance checks of one plan line up for diffing. A hash keeps it a stable,
// fixed-length column value regardless of URL length.
export function planKeyFor(plan: MeasurementPlan): string {
  const url = plan.meta?.url ?? '';
  const model = plan.meta?.businessModel ?? '';
  return createHash('sha256').update(`${url}::${model}`).digest('hex').slice(0, 32);
}

// Assemble a persistable run from a finished report + the plan/connectors that
// produced it. runId is unique per run; planKey is derived deterministically
// from the plan so successive runs of one plan line up for diffing.
export function buildGovernanceRun(
  report: LaunchReadinessReport,
  plan: MeasurementPlan,
  connectors?: GovernanceConnectors,
  now: Date = new Date()
): GovernanceRun {
  const siteUrl = report.meta.url;
  const slug = siteUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  const runId = `grun_${slug}_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    runId,
    siteUrl,
    planKey: planKeyFor(plan),
    createdAt: now.toISOString(),
    decision: report.decision,
    report,
    plan,
    connectors,
  };
}

// ─── Local-file fallback (dev scratch, append-only — NOT durable on Render) ───
async function readLocalRuns(): Promise<GovernanceRun[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as GovernanceRun[]) : [];
  } catch {
    return [];
  }
}

async function appendLocalRun(run: GovernanceRun): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  const existing = await readLocalRuns();
  existing.push(run);
  await fs.writeFile(LOCAL_FILE, JSON.stringify(existing, null, 2));
}

function byCreatedAtDesc(a: GovernanceRun, b: GovernanceRun): number {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

// ─── Public API ───

// Persist a run. Never throws on a storage problem: the dev-scratch write and
// the Supabase insert are both best-effort so a governance check is never
// dead-ended by persistence. (The route still guards the call defensively.)
export async function saveRun(run: GovernanceRun): Promise<void> {
  // Dev scratch first (ephemeral on Render — do NOT treat as durable).
  try {
    await appendLocalRun(run);
  } catch (err) {
    console.warn('[governance-store] local append failed:', (err as Error)?.message);
  }

  // Supabase is the durable store. Unconfigured → no-op (dev scratch only).
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(TABLE).insert(runToRow(run));
    if (error) throw error;
  } catch (err) {
    console.warn('[governance-store] Supabase insert failed:', (err as Error)?.message);
  }
}

// Latest prior run for this (siteUrl, planKey), or null if none. Supabase is the
// source of truth; falls back to the dev-scratch file when Supabase is down or
// unconfigured. Returns null (never throws) so the caller treats "no baseline"
// and "storage unreachable" identically — no drift, no dead-end.
export async function getLatestRun(siteUrl: string, planKey: string): Promise<GovernanceRun | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from(TABLE)
        .select('run_id, site_url, plan_key, created_at, decision, report')
        .eq('site_url', siteUrl)
        .eq('plan_key', planKey)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) return rowToRun(data[0] as GovernanceRunRow);
      return null;
    } catch (err) {
      console.warn('[governance-store] getLatestRun Supabase failed, trying local:', (err as Error)?.message);
    }
  }

  const local = (await readLocalRuns())
    .filter((r) => r.siteUrl === siteUrl && r.planKey === planKey)
    .sort(byCreatedAtDesc);
  return local[0] ?? null;
}

// The LATEST run per (siteUrl, planKey), each carrying plan + connectors — the
// re-run context the scheduler needs. Selects the extended columns; if the plan/
// connectors columns don't exist yet (pre-migration) the Supabase query errors
// and we fall back to the dev-scratch file. Used only by the scheduler.
export async function listLatestRuns(maxScan = 500): Promise<GovernanceRun[]> {
  let runs: GovernanceRun[] = [];
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from(TABLE)
        .select('run_id, site_url, plan_key, created_at, decision, report, plan, connectors')
        .order('created_at', { ascending: false })
        .limit(maxScan);
      if (error) throw error;
      runs = (data ?? []).map((row) => rowToRun(row as GovernanceRunRow));
    } catch (err) {
      console.warn('[governance-store] listLatestRuns Supabase failed, trying local:', (err as Error)?.message);
      runs = [];
    }
  }
  if (runs.length === 0) {
    runs = (await readLocalRuns()).sort(byCreatedAtDesc);
  }

  // Keep only the first (latest, since ordered desc) run per (siteUrl, planKey).
  const seen = new Set<string>();
  const latest: GovernanceRun[] = [];
  for (const r of runs) {
    const key = `${r.siteUrl}::${r.planKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest;
}
