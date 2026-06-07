/* eslint-disable @typescript-eslint/no-explicit-any */
// monitor-store.ts
// Minimal, swappable persistence for monitor runs. Mirrors the exact pattern
// used by lib/leads-store.ts: Supabase as the source of truth, with an
// append-only local JSON file as a fallback so run history is never silently
// lost when Supabase is unreachable. History is append-only — runs are never
// updated or deleted.
//
// Supabase table (create once):
//   create table monitor_runs (
//     run_id    text primary key,
//     site_url  text not null,
//     timestamp timestamptz not null,
//     data      jsonb not null
//   );
//   create index on monitor_runs (site_url, timestamp desc);

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import type { MonitorRun } from "./monitor-types";

const LOCAL_RUNS_FILE = path.join(process.cwd(), "data", "monitor-runs.json");
const TABLE = "monitor_runs";

export interface MonitorStore {
  saveRun(run: MonitorRun): Promise<void>;
  getLatestRun(siteUrl: string): Promise<MonitorRun | null>;
  listRuns(siteUrl: string, limit: number): Promise<MonitorRun[]>;
}

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  _supabase = createClient(url, key);
  return _supabase;
}

// ─── Local-file fallback (append-only) ───
async function readLocalRuns(): Promise<MonitorRun[]> {
  try {
    const text = await fs.readFile(LOCAL_RUNS_FILE, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendLocalRun(run: MonitorRun): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_RUNS_FILE), { recursive: true });
  const existing = await readLocalRuns();
  existing.push(run);
  await fs.writeFile(LOCAL_RUNS_FILE, JSON.stringify(existing, null, 2));
}

function byTimestampDesc(a: MonitorRun, b: MonitorRun): number {
  return (b.timestamp || "").localeCompare(a.timestamp || "");
}

// ─── Concrete implementation: Supabase + local fallback ───
class SupabaseMonitorStore implements MonitorStore {
  async saveRun(run: MonitorRun): Promise<void> {
    // Local file FIRST so the run is captured even if Supabase is down.
    try {
      await appendLocalRun(run);
    } catch (err) {
      console.warn("[monitor-store] local append failed:", (err as Error)?.message);
    }

    // Best-effort Supabase insert — the run is already safe on disk.
    try {
      const { error } = await getSupabase().from(TABLE).insert({
        run_id: run.runId,
        site_url: run.siteUrl,
        timestamp: run.timestamp,
        data: run,
      });
      if (error) throw error;
    } catch (err) {
      console.warn("[monitor-store] Supabase insert failed:", (err as Error)?.message);
    }
  }

  async getLatestRun(siteUrl: string): Promise<MonitorRun | null> {
    try {
      const { data, error } = await getSupabase()
        .from(TABLE)
        .select("data")
        .eq("site_url", siteUrl)
        .order("timestamp", { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) return data[0].data as MonitorRun;
    } catch (err) {
      console.warn("[monitor-store] Supabase getLatestRun failed, using local:", (err as Error)?.message);
    }

    const local = (await readLocalRuns())
      .filter((r) => r.siteUrl === siteUrl)
      .sort(byTimestampDesc);
    return local[0] ?? null;
  }

  async listRuns(siteUrl: string, limit: number): Promise<MonitorRun[]> {
    try {
      const { data, error } = await getSupabase()
        .from(TABLE)
        .select("data")
        .eq("site_url", siteUrl)
        .order("timestamp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (data) return data.map((r: any) => r.data as MonitorRun);
    } catch (err) {
      console.warn("[monitor-store] Supabase listRuns failed, using local:", (err as Error)?.message);
    }

    return (await readLocalRuns())
      .filter((r) => r.siteUrl === siteUrl)
      .sort(byTimestampDesc)
      .slice(0, limit);
  }
}

// Single shared instance. Swap this line to change backends.
export const monitorStore: MonitorStore = new SupabaseMonitorStore();
