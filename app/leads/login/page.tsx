'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import AnimatedBackground from '@/components/AnimatedBackground';

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
    <div className="h-screen w-screen overflow-hidden relative">
      <AnimatedBackground />

      <div className="relative h-full flex items-center justify-center p-6">

        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-xl bg-purple-500/20 mb-5">
              <Lock className="text-purple-400" size={22} />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Admin Login</h1>
            <p className="text-slate-400 text-sm">Sign in to view leads</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  required value={username} autoFocus
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500/50 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  type="password" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500/50 transition"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs pt-1">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 mt-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/30 transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : 'Sign in →'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-6">Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}
