'use client';

// Minimal, self-contained Sign-In page (Stage 1). Additive — not linked from the
// main product flow, so nothing existing changes. Starts Google Sign-In and shows
// the current session. No data is gated by this yet.

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
    // After signing out, land on the marketing home (full navigation so the
    // cleared session is reflected and nothing app-side keeps stale state).
    window.location.href = '/home';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ds-page p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ds-line-strong bg-ds-card p-8 text-center">
        <h1 className="text-xl font-bold text-ds-ink">Sign in</h1>
        <p className="text-sm text-ds-secondary mt-1 mb-6">Use your Google account.</p>

        {user === undefined ? (
          <p className="text-sm text-ds-secondary">Checking…</p>
        ) : user ? (
          <div className="space-y-3">
            <p className="text-sm text-ds-secondary">
              Signed in as <span className="font-semibold">{user.email || user.user_id}</span>
            </p>
            <Link
              href="/"
              className="block w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-ds-accent-ink font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition"
            >
              Go to the app →
            </Link>
            <button
              onClick={signOut}
              className="w-full py-2.5 rounded-xl bg-ds-card border border-ds-line-strong text-ds-secondary text-sm hover:bg-ds-panel transition"
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/google/start"
            className="block w-full py-2.5 rounded-xl bg-ds-accent text-ds-accent-ink font-semibold text-sm hover:opacity-90 transition"
          >
            Sign in with Google
          </a>
        )}
      </div>
    </div>
  );
}
