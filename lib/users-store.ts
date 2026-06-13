// users-store.ts — identity store for signed-in users (Stage 1). Mirrors the
// Supabase + local-fallback, graceful-degrade pattern of the other stores. Maps
// 1:1 to the `users` table created by the Stage-0 migration.
//
// Stage 1 scope: upsert/read a user's identity row on sign-in. NO authorization
// or data filtering happens here.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const TABLE = 'users';
const COLUMNS = 'id, email, name, created_at';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'users.json');

export interface User {
  id: string; // Google `sub` (or 'admin' for the seeded admin)
  email: string | null;
  name: string | null;
  created_at: string; // ISO 8601
}

let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

async function readLocalUsers(): Promise<User[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as User[]) : [];
  } catch {
    return [];
  }
}

async function upsertLocalUser(user: User): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  const existing = await readLocalUsers();
  const byId = new Map(existing.map((u) => [u.id, u]));
  byId.set(user.id, user);
  await fs.writeFile(LOCAL_FILE, JSON.stringify([...byId.values()], null, 2));
}

// A user by id, or null. Never throws (returns null on any storage failure).
export async function getUser(id: string): Promise<User | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from(TABLE).select(COLUMNS).eq('id', id).limit(1);
      if (error) throw error;
      if (data && data.length > 0) return data[0] as User;
      return null;
    } catch (err) {
      console.warn('[users-store] getUser Supabase failed, trying local:', (err as Error)?.message);
    }
  }
  return (await readLocalUsers()).find((u) => u.id === id) ?? null;
}

// Insert or update a user's identity. Preserves created_at across re-logins; only
// email/name refresh. Never throws — best-effort local + Supabase writes.
export async function upsertUser(input: { id: string; email?: string | null; name?: string | null }): Promise<User> {
  const existing = await getUser(input.id);
  const user: User = {
    id: input.id,
    email: input.email ?? existing?.email ?? null,
    name: input.name ?? existing?.name ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };

  try {
    await upsertLocalUser(user);
  } catch (err) {
    console.warn('[users-store] local upsert failed:', (err as Error)?.message);
  }

  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.from(TABLE).upsert(user, { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      console.warn('[users-store] Supabase upsert failed:', (err as Error)?.message);
    }
  }
  return user;
}
