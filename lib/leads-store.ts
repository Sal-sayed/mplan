/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Local-file fallback so leads are never silently lost when Supabase is
// unreachable (project paused / deleted / network down). The path is in
// .gitignore so PII never gets committed. On Render this file survives
// within a deploy but NOT across deploys — fix Supabase for durability.
const LOCAL_LEADS_FILE = path.join(process.cwd(), 'data', 'leads.json');

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  _supabase = createClient(url, key);
  return _supabase;
}

export interface Lead {
  id: string;
  email: string;
  mode: 'new' | 'audit';
  website_url: string;
  website_title: string;
  industry: string;
  business_type: string;
  health_score: number | null;
  health_grade: string | null;
  plan_summary: Record<string, number>;
  created_at: string;
}

async function readLocalLeads(): Promise<Lead[]> {
  try {
    const text = await fs.readFile(LOCAL_LEADS_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendLocalLead(lead: Lead): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_LEADS_FILE), { recursive: true });
  const existing = await readLocalLeads();
  existing.push(lead);
  await fs.writeFile(LOCAL_LEADS_FILE, JSON.stringify(existing, null, 2));
}

export async function getLeads(): Promise<Lead[]> {
  let cloudLeads: Lead[] = [];
  try {
    const { data, error } = await getSupabase()
      .from('leads')
      .select('id, email, mode, website_url, website_title, industry, business_type, health_score, health_grade, plan_summary, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    cloudLeads = data || [];
  } catch (err) {
    console.warn('Supabase getLeads failed, falling back to local file only:', (err as Error)?.message);
  }

  const localLeads = await readLocalLeads();
  const seen = new Set(cloudLeads.map(l => l.id));
  const merged = [...cloudLeads, ...localLeads.filter(l => !seen.has(l.id))];
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function saveLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> {
  const newLead: Lead = {
    ...lead,
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };

  // Always write to the local file FIRST so the lead is captured even if
  // Supabase is down. If this throws, we want the whole request to fail
  // loud rather than silently drop a lead.
  await appendLocalLead(newLead);

  // Best-effort Supabase write — overwrites the synthetic created_at with
  // whatever Supabase assigns and returns the canonical row.
  try {
    const { data, error } = await getSupabase()
      .from('leads')
      .insert(newLead)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase saveLead failed, lead stored locally only:', (err as Error)?.message);
    return newLead;
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local.slice(-1)}@${domain}`;
}
