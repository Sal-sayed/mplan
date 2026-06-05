/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { logCriticalError } from './critical-errors';

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
  email_sent?: boolean | null;
  email_provider?: string | null;
  email_message_id?: string | null;
  email_error?: string | null;
  email_sent_at?: string | null;
}

export interface SaveLeadResult {
  success: boolean;
  lead?: Lead;
  error?: string;
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

async function updateLocalLead(id: string, patch: Partial<Lead>): Promise<void> {
  const existing = await readLocalLeads();
  const idx = existing.findIndex(l => l.id === id);
  if (idx === -1) return;
  existing[idx] = { ...existing[idx], ...patch };
  await fs.writeFile(LOCAL_LEADS_FILE, JSON.stringify(existing, null, 2));
}

export async function getLeads(): Promise<Lead[]> {
  let cloudLeads: Lead[] = [];
  try {
    const { data, error } = await getSupabase()
      .from('leads')
      .select('id, email, mode, website_url, website_title, industry, business_type, health_score, health_grade, plan_summary, created_at, email_sent, email_provider, email_message_id, email_error, email_sent_at')
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

export async function saveLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<SaveLeadResult> {
  if (!lead.email) {
    const error = 'Cannot save lead: missing email';
    await logCriticalError('lead_save_validation_failed', { error, data: lead });
    return { success: false, error };
  }

  const newLead: Lead = {
    ...lead,
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };

  // Always write to the local file FIRST so the lead is captured even if
  // Supabase is down. If this throws, the whole save fails loud.
  try {
    await appendLocalLead(newLead);
  } catch (err) {
    const msg = (err as Error)?.message || 'Local lead write failed';
    await logCriticalError('lead_save_local_write_failed', {
      error: msg,
      leadEmail: newLead.email,
    });
    return { success: false, error: msg };
  }

  // Best-effort Supabase write — the lead is already safe on disk.
  try {
    const { data, error } = await getSupabase()
      .from('leads')
      .insert(newLead)
      .select()
      .single();
    if (error) throw error;
    console.log(`[leads] ✓ saved ${data.id} (${newLead.email})`);
    return { success: true, lead: data as Lead };
  } catch (err) {
    const msg = (err as Error)?.message || 'Supabase saveLead failed';
    await logCriticalError('lead_save_db_error', {
      error: msg,
      leadId: newLead.id,
      leadEmail: newLead.email,
      leadUrl: newLead.website_url,
    });
    // Lead is on disk — return success with the local copy.
    return { success: true, lead: newLead, error: msg };
  }
}

export interface EmailStatusUpdate {
  emailSent: boolean;
  emailProvider: string;
  emailMessageId?: string;
  emailError?: string;
}

export async function updateLeadEmailStatus(leadId: string, status: EmailStatusUpdate): Promise<void> {
  const patch: Partial<Lead> = {
    email_sent: status.emailSent,
    email_provider: status.emailProvider,
    email_message_id: status.emailMessageId ?? null,
    email_error: status.emailError ?? null,
    email_sent_at: status.emailSent ? new Date().toISOString() : null,
  };

  // Local file first — always.
  try {
    await updateLocalLead(leadId, patch);
  } catch (err) {
    console.warn('[leads] local update failed:', (err as Error)?.message);
  }

  // Supabase best-effort.
  try {
    const { error } = await getSupabase()
      .from('leads')
      .update(patch)
      .eq('id', leadId);
    if (error) throw error;
  } catch (err) {
    const msg = (err as Error)?.message || 'updateLeadEmailStatus failed';
    await logCriticalError('lead_email_status_update_failed', {
      error: msg,
      leadId,
      status,
    });
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local.slice(-1)}@${domain}`;
}
