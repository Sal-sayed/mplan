// Single-operator Google token store. Mirrors lib/leads-store.ts: a lazily
// created Supabase client (service-role) with a local-file fallback so the
// connection survives even when Supabase is unreachable (their key is currently
// an anon key, so RLS may block the table — the local file then takes over).
//
// The refresh token is encrypted at rest (AES-256-GCM, key derived from
// JWT_SECRET). The short-lived access token is stored as-is and refreshed on
// demand by getValidAccessToken().

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';

const ROW_ID = 'operator';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'google-oauth.json');

interface StoredToken {
  access_token: string;
  refresh_token_enc: string | null;
  expiry: number; // epoch ms when the access token expires
  scope: string;
}

// ─── encryption (refresh token only) ───

function encKey(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_ENC_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET (or GOOGLE_TOKEN_ENC_KEY) is required to encrypt Google tokens');
  return scryptSync(secret, 'google-oauth-token-v1', 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(enc: string): string {
  const buf = Buffer.from(enc, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ─── storage backends (Supabase, with local-file fallback) ───

let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

async function readLocal(): Promise<StoredToken | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    return parsed && parsed.access_token ? (parsed as StoredToken) : null;
  } catch {
    return null;
  }
}

async function writeLocal(rec: StoredToken): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(rec, null, 2));
}

async function readRecord(): Promise<StoredToken | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('google_oauth')
        .select('access_token, refresh_token_enc, expiry, scope')
        .eq('id', ROW_ID)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as StoredToken;
    } catch {
      /* fall through to local */
    }
  }
  return readLocal();
}

async function writeRecord(rec: StoredToken): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from('google_oauth')
        .upsert({ id: ROW_ID, ...rec, updated_at: new Date().toISOString() });
      if (error) throw error;
      return;
    } catch {
      /* fall back to local file */
    }
  }
  await writeLocal(rec);
}

async function deleteRecord(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('google_oauth').delete().eq('id', ROW_ID);
    } catch {
      /* ignore — still clear local below */
    }
  }
  try {
    await fs.unlink(LOCAL_FILE);
  } catch {
    /* already gone */
  }
}

// ─── public API ───

export async function saveTokens(t: {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scope: string;
}): Promise<void> {
  const expiry = Date.now() + Math.max(0, t.expiresInSec) * 1000;
  let refresh_token_enc: string | null;
  if (t.refreshToken) {
    refresh_token_enc = encrypt(t.refreshToken);
  } else {
    // A refresh response often omits the refresh token — keep the stored one.
    const existing = await readRecord();
    refresh_token_enc = existing?.refresh_token_enc ?? null;
  }
  await writeRecord({ access_token: t.accessToken, refresh_token_enc, expiry, scope: t.scope });
}

// Returns a non-expired access token, transparently refreshing when needed.
// Throws if not connected or the refresh token is gone (caller → reconnect).
export async function getValidAccessToken(): Promise<string> {
  const rec = await readRecord();
  if (!rec) throw new Error('Google account not connected');
  if (rec.expiry - Date.now() > 30_000) return rec.access_token;
  if (!rec.refresh_token_enc) {
    throw new Error('Google session expired and no refresh token is stored — reconnect Google');
  }
  const { refreshAccessToken } = await import('./oauth.ts');
  const refreshed = await refreshAccessToken(decrypt(rec.refresh_token_enc));
  await saveTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresInSec: refreshed.expires_in,
    scope: refreshed.scope || rec.scope,
  });
  return refreshed.access_token;
}

export async function clearTokens(): Promise<void> {
  await deleteRecord();
}

export async function getStatus(): Promise<{ connected: boolean; scopes?: string[]; expiresAt?: string }> {
  const rec = await readRecord();
  if (!rec) return { connected: false };
  return {
    connected: true,
    scopes: rec.scope ? rec.scope.split(' ') : [],
    expiresAt: new Date(rec.expiry).toISOString(),
  };
}
