'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Loader2 } from 'lucide-react';

export default function LeadsLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/leads-admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (data.success) {
      router.push('/leads');
      router.refresh();
    } else {
      setError(data.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-ds-page">

      <div className="relative h-full flex items-center justify-center p-6">

        <div className="w-full max-w-sm rounded-2xl border border-ds-line bg-ds-card p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-xl bg-ds-accent-soft mb-5">
              <Lock className="text-ds-accent" size={22} />
            </div>
            <h1 className="text-2xl font-bold text-ds-ink mb-1">Admin Login</h1>
            <p className="text-ds-secondary text-sm">Sign in to view leads</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ds-secondary mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-muted" size={15} />
                <input
                  required value={username} autoFocus
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-ds-card border border-ds-line rounded-xl text-ds-ink outline-none focus:border-ds-accent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ds-secondary mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-muted" size={15} />
                <input
                  type="password" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-ds-card border border-ds-line rounded-xl text-ds-ink outline-none focus:border-ds-accent transition"
                />
              </div>
            </div>

            {error && <p className="text-ds-danger text-xs pt-1">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 mt-4 rounded-xl bg-ds-accent text-ds-accent-ink font-semibold disabled:opacity-50 hover:bg-ds-accent-hover shadow-sm transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : 'Sign in →'}
            </button>
          </form>

          <p className="text-center text-xs text-ds-muted mt-6">Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}
