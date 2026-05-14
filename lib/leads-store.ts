/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'data', 'leads.json');

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

function ensureFile() {
  const dir = path.dirname(LEADS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]', 'utf-8');
}

export function getLeads(): Lead[] {
  ensureFile();
  try {
    const raw = fs.readFileSync(LEADS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLead(lead: Omit<Lead, 'id' | 'created_at'>): Lead {
  ensureFile();
  const leads = getLeads();
  const newLead: Lead = {
    ...lead,
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  leads.unshift(newLead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
  return newLead;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local.slice(-1)}@${domain}`;
}
