// plans-store.ts — per-user plan persistence (Stage-0 SCAFFOLDING).
//
// Mirrors governance-store / metric-store: a lazily-created Supabase service-role
// client with an append-only local-JSON fallback, graceful degrade (never throws,
// Supabase is the only durable store on Render, the local file is dev scratch).
//
// IMPORTANT — Stage 0 only: this store is DEFINED but NOT WIRED. No route calls
// savePlan / getPlan / listPlansByUser yet, and there is NO ownership ENFORCEMENT
// here — listPlansByUser filters by the userId it's GIVEN, but nothing decides
// who the caller is at this stage. Generation still persists nothing; the running
// app is unchanged. Wiring + auth + isolation are Stage 2 / 5, not now.
//
// The Supabase table is created by hand (NOT from code) — Stage-0 migration:
//   create table plans (
//     id text primary key, user_id text not null, site_url text,
//     business_model text, plan jsonb not null, created_at timestamptz default now());
//   create index on plans (user_id, created_at desc);

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import type { MeasurementPlan } from './types.ts';

const TABLE = 'plans';
const COLUMNS = 'id, user_id, site_url, business_model, plan, created_at';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'plans.json');

// 1:1 with the plans table columns (snake_case), like the Lead record.
export interface Plan {
  id: string;
  user_id: string;
  site_url: string | null;
  business_model: string | null;
  plan: MeasurementPlan;
  created_at: string; // ISO 8601
}

export interface NewPlanInput {
  user_id: string;
  plan: MeasurementPlan;
  site_url?: string | null;
  business_model?: string | null;
}

// Stamp a persistable Plan from its inputs (id + created_at). The owner is passed
// in — this store does NOT decide ownership.
export function buildPlan(input: NewPlanInput, now: Date = new Date()): Plan {
  const slug = (input.site_url ?? '').replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  return {
    id: `plan_${slug}_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: input.user_id,
    site_url: input.site_url ?? null,
    business_model: input.business_model ?? null,
    plan: input.plan,
    created_at: now.toISOString(),
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

// ─── Local-file fallback (dev scratch, upsert-by-id — NOT durable on Render) ───
async function readLocalPlans(): Promise<Plan[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as Plan[]) : [];
  } catch {
    return [];
  }
}

async function upsertLocalPlan(plan: Plan): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  const existing = await readLocalPlans();
  const byId = new Map(existing.map((p) => [p.id, p]));
  byId.set(plan.id, plan);
  await fs.writeFile(LOCAL_FILE, JSON.stringify([...byId.values()], null, 2));
}

function byCreatedAtDesc(a: Plan, b: Plan): number {
  return (b.created_at || '').localeCompare(a.created_at || '');
}

// ─── Public API (DEFINED but not yet called by any route) ───

// Persist a plan (idempotent on id). Never throws — both the dev-scratch write and
// the Supabase upsert are best-effort.
export async function savePlan(plan: Plan): Promise<void> {
  try {
    await upsertLocalPlan(plan);
  } catch (err) {
    console.warn('[plans-store] local upsert failed:', (err as Error)?.message);
  }

  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(TABLE).upsert(plan, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.warn('[plans-store] Supabase upsert failed:', (err as Error)?.message);
  }
}

// A single plan by id, or null. Returns null (never throws) on any storage failure.
export async function getPlan(id: string): Promise<Plan | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from(TABLE).select(COLUMNS).eq('id', id).limit(1);
      if (error) throw error;
      if (data && data.length > 0) return data[0] as Plan;
      return null;
    } catch (err) {
      console.warn('[plans-store] getPlan Supabase failed, trying local:', (err as Error)?.message);
    }
  }
  return (await readLocalPlans()).find((p) => p.id === id) ?? null;
}

// Plans owned by a user, newest first. Filters by the userId it is GIVEN — it does
// not decide who the caller is (that's a later stage). Returns [] on failure.
export async function listPlansByUser(userId: string): Promise<Plan[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from(TABLE).select(COLUMNS).eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      if (data) return data as Plan[];
      return [];
    } catch (err) {
      console.warn('[plans-store] listPlansByUser Supabase failed, trying local:', (err as Error)?.message);
    }
  }
  return (await readLocalPlans()).filter((p) => p.user_id === userId).sort(byCreatedAtDesc);
}
