/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Local-file fallback for critical errors so they're never lost even if
// Supabase is down. Same .gitignore'd location as leads.
const LOCAL_ERRORS_FILE = path.join(process.cwd(), 'data', 'critical-errors.json');

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

async function appendLocalError(entry: any): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_ERRORS_FILE), { recursive: true });
    let existing: any[] = [];
    try {
      const text = await fs.readFile(LOCAL_ERRORS_FILE, 'utf8');
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) existing = parsed;
    } catch { /* file may not exist */ }
    existing.push(entry);
    await fs.writeFile(LOCAL_ERRORS_FILE, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error('[CRITICAL] Could not append local error log:', (err as Error)?.message);
  }
}

export async function logCriticalError(eventType: string, payload: Record<string, any>): Promise<void> {
  const entry = {
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };

  // 1. Always log to console (visible in PM2/Render logs).
  console.error(`[CRITICAL] ${eventType}:`, JSON.stringify(payload));

  // 2. Local file (so the record survives even when Supabase is unreachable).
  await appendLocalError(entry);

  // 3. Best-effort Supabase write.
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('critical_errors').insert(entry);
    } catch (err) {
      console.error('[CRITICAL] Could not write to critical_errors table:', (err as Error)?.message);
    }
  }

  // 4. Optional webhook notification (Slack/Discord) when configured.
  if (process.env.ERROR_WEBHOOK_URL) {
    try {
      await fetch(process.env.ERROR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Critical error: ${eventType}\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``,
        }),
      });
    } catch { /* webhook failure is not actionable */ }
  }
}

export interface CriticalErrorRecord {
  id: number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
}

export async function getUnresolvedErrors(limit = 100): Promise<CriticalErrorRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('critical_errors')
      .select('id, event_type, payload, created_at, resolved, resolved_at')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as CriticalErrorRecord[]) || [];
  } catch (err) {
    console.warn('getUnresolvedErrors failed:', (err as Error)?.message);
    return [];
  }
}
