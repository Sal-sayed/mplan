'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, FileSpreadsheet, Users, Globe, LogOut, Loader2 } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Lead {
  id: string;
  email: string;
  mode: 'new' | 'audit';
  website_url: string;
  website_title: string;
  industry: string;
  business_type: string;
  health_score: number;
  health_grade: string;
  created_at: string;
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

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leads-admin/data')
      .then(r => {
        if (r.status === 401) { router.push('/leads/login'); return null; }
        return r.json();
      })
      .then(data => {
        if (data) { setLeads(data.leads || []); setTotal(data.total || 0); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/leads-admin/logout', { method: 'POST' });
    router.push('/leads/login');
    router.refresh();
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-ds-page flex flex-col">
      {/* Header */}
      <header className="shrink-0 h-14 px-6 flex items-center justify-between border-b border-ds-line">
        <div />
        <div className="flex items-center gap-3">
          <span className="text-xs text-ds-secondary uppercase tracking-wider hidden sm:inline">Admin</span>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ds-card border border-ds-line text-ds-secondary hover:text-ds-ink transition text-xs">
            <LogOut size={12} /> Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 lg:px-10 py-5">
        {/* Title row */}
        <div className="flex items-end justify-between mb-5 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-ds-ink">Lead Exports</h1>
            <p className="text-ds-secondary text-xs mt-1">All measurement plan exports in one place</p>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 bg-ds-card border border-ds-line rounded-lg px-4 py-2.5">
            <Users className="text-blue-400" size={16} />
            <div>
              <span className="text-xl font-bold text-ds-ink">{total}</span>
              <span className="text-[10px] text-ds-secondary ml-1.5">exports</span>
            </div>
          </motion.div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto text-ds-secondary animate-spin mb-3" size={20} />
                <p className="text-sm text-ds-secondary">Loading leads...</p>
              </div>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileSpreadsheet className="mx-auto text-ds-secondary mb-3" size={28} />
                <h3 className="text-ds-ink font-semibold text-lg mb-1">No exports yet</h3>
                <p className="text-ds-secondary text-sm">Leads will appear here once users export their measurement plans</p>
              </div>
            </div>
          ) : (
            <div className="bg-ds-card border border-ds-line rounded-xl overflow-hidden flex flex-col min-h-0">
              {/* Table header */}
              <div className="shrink-0 grid grid-cols-[1.8fr_0.6fr_2.5fr_1.3fr] gap-0 px-5 py-2.5 border-b border-ds-line bg-ds-card">
                <span className="text-[10px] text-ds-secondary uppercase tracking-widest font-medium">Email</span>
                <span className="text-[10px] text-ds-secondary uppercase tracking-widest font-medium">Mode</span>
                <span className="text-[10px] text-ds-secondary uppercase tracking-widest font-medium">Website</span>
                <span className="text-[10px] text-ds-secondary uppercase tracking-widest font-medium">Date & Time</span>
              </div>

              {/* Table body - scrollable */}
              <div className="flex-1 overflow-y-auto scroll-area">
                {leads.map((lead, i) => (
                  <motion.div key={lead.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="grid grid-cols-[1.8fr_0.6fr_2.5fr_1.3fr] gap-0 items-center px-5 py-3 border-b border-ds-line last:border-b-0 hover:bg-ds-card transition">
                    <span className="text-sm text-ds-ink font-mono truncate pr-3">{lead.email}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-medium ${
                      lead.mode === 'audit'
                        ? 'bg-orange-500/10 text-orange-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {lead.mode === 'audit' ? 'Audit' : 'New'}
                    </span>
                    <div className="flex items-center gap-2 min-w-0 pr-3">
                      <Globe size={11} className="text-ds-secondary shrink-0" />
                      <span className="text-sm text-ds-secondary truncate">{lead.website_title || lead.website_url || '—'}</span>
                    </div>
                    <span className="text-xs text-ds-secondary font-mono">{formatDateTime(lead.created_at)}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
