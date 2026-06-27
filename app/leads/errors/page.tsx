'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CriticalError {
  id: number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  resolved: boolean;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

export default function ErrorsPage() {
  const [errors, setErrors] = useState<CriticalError[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/leads-admin/errors', { credentials: 'include' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error || 'Failed to load errors');
        } else {
          setErrors(json.errors || []);
          setTotal(json.total || 0);
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error)?.message || 'Failed to load errors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-ds-page text-ds-ink">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/leads" className="inline-flex items-center gap-2 text-sm text-ds-secondary hover:text-ds-ink">
              <ArrowLeft size={16} /> Leads
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-400" />
              Critical Errors ({total})
            </h1>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-ds-secondary text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading…
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-rose-300">
            {loadError}
          </div>
        )}

        {!loading && !loadError && errors.length === 0 && (
          <div className="rounded-lg border border-ds-line bg-ds-card p-8 text-center text-ds-secondary text-sm">
            No unresolved errors. 🎉
          </div>
        )}

        {!loading && !loadError && errors.length > 0 && (
          <div className="space-y-3">
            {errors.map(err => (
              <div key={err.id} className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="font-mono font-bold text-rose-300">{err.event_type}</span>
                  <span className="text-ds-secondary">{formatDateTime(err.created_at)}</span>
                </div>
                <pre className="text-xs text-ds-secondary overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(err.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
