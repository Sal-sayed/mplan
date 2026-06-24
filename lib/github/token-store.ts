// Per-user GitHub token store. A near-mechanical clone of lib/google/token-store.ts,
// against the `github_oauth` table. Each user's tokens live in their own row keyed
// by user_id; BOTH the access and refresh tokens are encrypted at rest (AES-256-GCM,
// key from JWT_SECRET). Mirrors leads-store: Supabase service-role with a local-file
// fallback (a per-user MAP) so the connection survives when Supabase is unreachable.
//
// Hand-run migration (the user runs this in Supabase, like the other tables):
//   create table github_oauth (
//     user_id          text primary key,
//     access_token_enc text,
//     refresh_token_enc text,
//     expires_at       timestamptz,
//     github_login     text,
//     created_at       timestamptz default now()
//   );
//
// Token lifetime: a GitHub App issues an expiring access token (+ refresh token),
// so expires_at is set and getValidAccessToken() refreshes near expiry. A classic
// OAuth App token does NOT expire — expires_at is null and the token is returned
// as-is forever (no refresh attempted).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';

const LOCAL_FILE = path.join(process.cwd(), 'data', 'github-oauth.json');

// Refresh slightly early so an in-flight request never races expiry.
const REFRESH_SKEW_MS = 60_000;

interface StoredToken {
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null; // ISO 8601, or null for a non-expiring OAuth-App token
  github_login: string | null;
}

// ─── encryption ───

function encKey(): Buffer {
  const secret = process.env.GITHUB_TOKEN_ENC_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET (or GITHUB_TOKEN_ENC_KEY) is required to encrypt GitHub tokens');
  return scryptSync(secret, 'github-oauth-token-v1', 32);
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

async function readLocalMap(): Promise<Record<string, StoredToken>> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed as Record<string, StoredToken>;
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
        .from('github_oauth')
        .select('access_token_enc, refresh_token_enc, expires_at, github_login')
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
        .from('github_oauth')
        .upsert({ user_id: userId, ...rec }, { onConflict: 'user_id' });
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
      await sb.from('github_oauth').delete().eq('user_id', userId);
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
  t: { accessToken: string; refreshToken?: string; expiresInSec?: number; githubLogin?: string }
): Promise<void> {
  const expires_at =
    typeof t.expiresInSec === 'number' && t.expiresInSec > 0
      ? new Date(Date.now() + t.expiresInSec * 1000).toISOString()
      : null;

  let refresh_token_enc: string | null;
  if (t.refreshToken) {
    refresh_token_enc = encrypt(t.refreshToken);
  } else {
    // A refresh response can omit the refresh token — keep the stored one.
    const existing = await readRecord(userId);
    refresh_token_enc = existing?.refresh_token_enc ?? null;
  }

  const existing = t.githubLogin ? null : await readRecord(userId);
  await writeRecord(userId, {
    access_token_enc: encrypt(t.accessToken),
    refresh_token_enc,
    expires_at,
    github_login: t.githubLogin ?? existing?.github_login ?? null,
  });
}

// A valid access token for one user, transparently refreshing an expiring
// (GitHub App) token when near expiry. Throws if the user isn't connected.
export async function getValidAccessToken(userId: string): Promise<string> {
  const rec = await readRecord(userId);
  if (!rec) throw new Error('GitHub account not connected');

  // Non-expiring OAuth-App token (or no expiry recorded): return as-is.
  if (!rec.expires_at) return decrypt(rec.access_token_enc);

  const expiryMs = Date.parse(rec.expires_at);
  if (Number.isNaN(expiryMs) || expiryMs - Date.now() > REFRESH_SKEW_MS) {
    return decrypt(rec.access_token_enc);
  }

  if (!rec.refresh_token_enc) {
    throw new Error('GitHub session expired and no refresh token is stored — reconnect GitHub');
  }
  const { refreshAccessToken } = await import('./oauth.ts');
  const refreshed = await refreshAccessToken(decrypt(rec.refresh_token_enc));
  await saveTokens(userId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresInSec: refreshed.expires_in,
  });
  return refreshed.access_token;
}

export async function clearTokens(userId: string): Promise<void> {
  await deleteRecord(userId);
}

export async function getStatus(
  userId: string
): Promise<{ connected: boolean; login?: string; expiresAt?: string }> {
  const rec = await readRecord(userId);
  if (!rec) return { connected: false };
  return {
    connected: true,
    login: rec.github_login ?? undefined,
    expiresAt: rec.expires_at ?? undefined,
  };
}
