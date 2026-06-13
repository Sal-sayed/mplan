'use client';

// Minimal, self-contained Sign-In page (Stage 1). Additive — not linked from the
// main product flow, so nothing existing changes. Starts Google Sign-In and shows
// the current session. No data is gated by this yet.

import { useEffect, useState } from 'react';

interface Me {
  user_id: string;
  email?: string;
}

export default function SignInPage() {
  const [user, setUser] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser((d.user as Me) ?? null))
      .catch(() => setUser(null));
  }, []);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1120] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#0d1525] p-8 text-center">
        <h1 className="text-xl font-bold text-white">Sign in</h1>
        <p className="text-sm text-slate-400 mt-1 mb-6">Use your Google account.</p>

        {user === undefined ? (
          <p className="text-sm text-slate-500">Checking…</p>
        ) : user ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-200">
              Signed in as <span className="font-semibold">{user.email || user.user_id}</span>
            </p>
            <button
              onClick={signOut}
              className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-slate-200 text-sm hover:bg-white/[0.1] transition"
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/google/start"
            className="block w-full py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition"
          >
            Sign in with Google
          </a>
        )}
      </div>
    </div>
  );
}
