/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export async function getLeads(): Promise<Lead[]> {
  const { data, error } = await getSupabase()
    .from('leads')
    .select('id, email, mode, website_url, website_title, industry, business_type, health_score, health_grade, plan_summary, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getLeads error:', error);
    return [];
  }
  return data || [];
}

export async function saveLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> {
  const newLead = {
    ...lead,
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  const { data, error } = await getSupabase()
    .from('leads')
    .insert(newLead)
    .select()
    .single();

  if (error) {
    console.error('Supabase saveLead error:', error);
    // Return a fallback so the pipeline doesn't break
    return { ...newLead, created_at: new Date().toISOString() };
  }
  return data;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local.slice(-1)}@${domain}`;
}
