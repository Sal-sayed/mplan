'use client';

// Saved-plan history (Stage 5). Lists the signed-in user's plans and opens one's
// launch gate directly — no regeneration: it fetches the stored plan and runs
// /api/launch-readiness on it, reusing LaunchReadinessScreen. Per-user: the API
// returns only the caller's plans.
//
// UI: this LIST view is the first screen converted to the new light design system
// (components/ds). Logic, handlers, data flow, and the API calls are UNCHANGED — only
// the presentation. Opening a plan still shows the existing LaunchReadinessScreen
// (converted in a later step).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import LaunchReadinessScreen from '@/components/LaunchReadinessScreen';
import { Card, Button } from '@/components/ds';
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
    <div className="flex h-screen w-full flex-col bg-ds-page text-ds-ink">
      {/* Top bar (new design system) */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ds-line bg-ds-card px-4 sm:px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ds-accent text-sm font-bold text-ds-accent-ink">S</span>
        <span className="text-sm font-semibold text-ds-ink">Your saved plans</span>
        <Link href="/" className="ml-auto inline-flex items-center gap-1 text-xs text-ds-secondary transition hover:text-ds-ink">
          <ArrowLeft size={13} /> Back to app
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight text-ds-ink">Saved plans</h1>
            <p className="mt-1 text-sm text-ds-secondary">Open a saved plan to re-run its launch readiness check — no regeneration.</p>
          </div>

          {authed === undefined ? (
            <p className="text-sm text-ds-muted">Loading…</p>
          ) : authed === false ? (
            <Card className="text-center">
              <p className="mb-4 text-sm text-ds-secondary">Sign in to see your saved plans.</p>
              <a
                href="/api/auth/google/start"
                className="inline-flex items-center justify-center rounded-lg bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-ink transition hover:bg-ds-accent-hover"
              >
                Sign in with Google
              </a>
            </Card>
          ) : plans.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-ds-secondary">
                No saved plans yet. Generate a plan and click <span className="font-medium text-ds-ink">Save to history</span>.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-ds border border-ds-line bg-ds-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                    <Clock size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ds-ink">{p.site_url || 'Untitled plan'}</p>
                    <p className="mt-0.5 text-xs text-ds-secondary">
                      {p.business_model || '—'} · {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="primary" onClick={() => open(p.id)} disabled={opening === p.id} className="shrink-0">
                    {opening === p.id ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Open
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="mt-4 text-sm text-ds-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
