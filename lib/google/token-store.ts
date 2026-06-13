// Per-user Google token store (Stage 4). Each user's tokens live in their own
// google_oauth row keyed by user_id; the refresh token is encrypted at rest
// (AES-256-GCM, key from JWT_SECRET). Mirrors leads-store: Supabase service-role
// with a local-file fallback (now a per-user MAP) so the connection survives when
// Supabase is unreachable.
//
// Migration (hand-run): a unique constraint on google_oauth.user_id so the
// per-user upsert has a conflict target —
//   alter table google_oauth add constraint google_oauth_user_id_key unique (user_id);
// The pre-existing single row (id='operator', user_id='admin') keeps working — it
// is now looked up by user_id='admin' (the Stage-0 backfill).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';

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

// The local fallback is now a per-user map { [userId]: StoredToken }. Tolerates
// the legacy single-token shape by attributing it to 'admin'.
async function readLocalMap(): Promise<Record<string, StoredToken>> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.access_token === 'string') return { admin: parsed as StoredToken }; // legacy single token
      return parsed as Record<string, StoredToken>;
    }
  } catch {
    /* none */
  }
  return {};
}

async function writeLocalMap(map: Record<string, StoredToken>): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(map, null, 2));
}

async function readRecord(userId: string): Promise<StoredToken | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('google_oauth')
        .select('access_token, refresh_token_enc, expiry, scope')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as StoredToken;
      return null;
    } catch {
      /* fall through to local */
    }
  }
  return (await readLocalMap())[userId] ?? null;
}

async function writeRecord(userId: string, rec: StoredToken): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from('google_oauth')
        .upsert({ id: userId, user_id: userId, ...rec, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return;
    } catch {
      /* fall back to local file */
    }
  }
  const map = await readLocalMap();
  map[userId] = rec;
  await writeLocalMap(map);
}

async function deleteRecord(userId: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('google_oauth').delete().eq('user_id', userId);
    } catch {
      /* ignore — still clear local below */
    }
  }
  try {
    const map = await readLocalMap();
    if (userId in map) {
      delete map[userId];
      await writeLocalMap(map);
    }
  } catch {
    /* already gone */
  }
}

// ─── public API (per-user) ───

export async function saveTokens(
  userId: string,
  t: { accessToken: string; refreshToken?: string; expiresInSec: number; scope: string }
): Promise<void> {
  const expiry = Date.now() + Math.max(0, t.expiresInSec) * 1000;
  let refresh_token_enc: string | null;
  if (t.refreshToken) {
    refresh_token_enc = encrypt(t.refreshToken);
  } else {
    // A refresh response often omits the refresh token — keep the stored one.
    const existing = await readRecord(userId);
    refresh_token_enc = existing?.refresh_token_enc ?? null;
  }
  await writeRecord(userId, { access_token: t.accessToken, refresh_token_enc, expiry, scope: t.scope });
}

// A non-expired access token for one user, transparently refreshing when needed.
// Throws if that user isn't connected or their refresh token is gone.
export async function getValidAccessToken(userId: string): Promise<string> {
  const rec = await readRecord(userId);
  if (!rec) throw new Error('Google account not connected');
  if (rec.expiry - Date.now() > 30_000) return rec.access_token;
  if (!rec.refresh_token_enc) {
    throw new Error('Google session expired and no refresh token is stored — reconnect Google');
  }
  const { refreshAccessToken } = await import('./oauth.ts');
  const refreshed = await refreshAccessToken(decrypt(rec.refresh_token_enc));
  await saveTokens(userId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresInSec: refreshed.expires_in,
    scope: refreshed.scope || rec.scope,
  });
  return refreshed.access_token;
}

export async function clearTokens(userId: string): Promise<void> {
  await deleteRecord(userId);
}

export async function getStatus(userId: string): Promise<{ connected: boolean; scopes?: string[]; expiresAt?: string }> {
  const rec = await readRecord(userId);
  if (!rec) return { connected: false };
  return {
    connected: true,
    scopes: rec.scope ? rec.scope.split(' ') : [],
    expiresAt: new Date(rec.expiry).toISOString(),
  };
}
