'use client';

// Saved-plan history (Stage 5). Lists the signed-in user's plans and opens one's
// launch gate directly — no regeneration: it fetches the stored plan and runs
// /api/launch-readiness on it, reusing LaunchReadinessScreen. Per-user: the API
// returns only the caller's plans.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight, Loader2 } from 'lucide-react';
import LaunchReadinessScreen from '@/components/LaunchReadinessScreen';
import type { LaunchReadinessReport } from '@/lib/measurement/launch-readiness';

interface PlanSummary {
  id: string;
  site_url: string | null;
  business_model: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [report, setReport] = useState<LaunchReadinessReport | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/plans')
      .then(async (r) => {
        if (r.status === 401) { setAuthed(false); return; }
        const d = await r.json();
        setAuthed(true);
        setPlans((d.plans as PlanSummary[]) ?? []);
      })
      .catch(() => setAuthed(false));
  }, []);

  const open = async (id: string) => {
    setOpening(id); setError('');
    try {
      const pr = await fetch(`/api/plans?id=${encodeURIComponent(id)}`);
      if (!pr.ok) throw new Error('Could not load that plan.');
      const { plan } = await pr.json();
      const rr = await fetch('/api/launch-readiness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const rj = await rr.json();
      if (!rr.ok || !rj.success) throw new Error(rj.error || 'Launch readiness failed.');
      setReport(rj.report as LaunchReadinessReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open the plan.');
    } finally {
      setOpening(null);
    }
  };

  if (report) {
    return <LaunchReadinessScreen report={report} onReset={() => setReport(null)} />;
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200">
      <header className="h-16 px-6 flex items-center gap-3 border-b border-white/[0.08] bg-[#0d1525]">
        <Clock size={18} className="text-cyan-400" />
        <span className="text-sm font-semibold text-white">Your saved plans</span>
        <Link href="/" className="ml-auto text-xs text-slate-400 hover:text-slate-200">← Back to app</Link>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {authed === undefined ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : authed === false ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <p className="text-sm text-slate-300 mb-4">Sign in to see your saved plans.</p>
            <a href="/api/auth/google/start" className="inline-block px-4 py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition">Sign in with Google</a>
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <p className="text-sm text-slate-400">No saved plans yet. Generate a plan and click <span className="text-slate-200 font-medium">Save to history</span>.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {plans.map((p) => (
              <li key={p.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{p.site_url || 'Untitled plan'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.business_model || '—'} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => open(p.id)}
                  disabled={opening === p.id}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs font-medium hover:bg-blue-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {opening === p.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />} Open
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}
      </div>
    </div>
  );
}
