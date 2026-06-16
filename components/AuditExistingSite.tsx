/**
 * AuditExistingSite component
 *
 * Scrapes a live site's GA4/GTM setup and emails an audit report comparing
 * the site's actual events against the recommended measurement plan.
 *
 * Props:
 *   - recommendedEvents: Array<{ name: string, priority: string, description: string }>
 *   - defaultUrl: string (optional, pre-fills the URL input)
 *
 * Integration: Parent passes recommendedEvents from the existing Events tab.
 * The component posts to /api/audit-existing-site and renders results inline.
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Mail, Loader2, CheckCircle2, AlertCircle, Search, ExternalLink } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RecommendedEvent {
  name: string;
  priority: string;
  description: string;
}

interface Props {
  recommendedEvents: RecommendedEvent[];
  defaultUrl?: string;
}

export default function AuditExistingSite({ recommendedEvents, defaultUrl = '' }: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const canSubmit = url.match(/^https?:\/\/.+\..+/) && email.includes('@') && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/audit-existing-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, recipientEmail: email, recommendedEvents }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Audit failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const priColor = (pri: string) => {
    if (pri === 'MUST') return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' };
    if (pri === 'SHOULD') return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' };
    return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' };
  };

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">

      {/* ─── HEADER ─── */}
      <div className="px-6 py-5 border-b border-line">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg text-ink font-semibold flex items-center gap-2">
              <Search size={18} className="text-blue-400" />
              Audit Existing Site
            </h2>
            <p className="text-sm text-faint mt-0.5">Scrape live GA4 / GTM setup and email the report</p>
          </div>
          <span className="text-xs bg-blue-600/20 text-blue-300 px-3 py-1 rounded-full font-medium">
            {recommendedEvents.length} planned events
          </span>
        </div>
      </div>

      {/* ─── FORM ─── */}
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <div>
          <label className="text-xs text-faint uppercase tracking-wider font-medium mb-1.5 block">Site URL</label>
          <div className="flex items-center bg-overlay border border-line rounded-lg overflow-hidden focus-within:border-blue-500/50 transition">
            <Globe size={15} className="text-faint ml-3" />
            <input
              type="url" required value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 bg-transparent text-ink placeholder:text-faint px-3 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-faint uppercase tracking-wider font-medium mb-1.5 block">Send report to (email)</label>
          <div className="flex items-center bg-overlay border border-line rounded-lg overflow-hidden focus-within:border-blue-500/50 transition">
            <Mail size={15} className="text-faint ml-3" />
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="flex-1 bg-transparent text-ink placeholder:text-faint px-3 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-overlay-strong disabled:text-faint text-onaccent font-semibold text-sm flex items-center justify-center gap-2 transition"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Scraping &amp; Emailing&hellip;</>
          ) : (
            <><Search size={15} /> Run Audit + Email Report</>
          )}
        </button>
      </form>

      {/* ─── ERROR ─── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-6 mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── RESULTS ─── */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 pb-6 space-y-5">

            {/* Email success */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-emerald-300 font-medium">Email sent to {email}</p>
                <p className="text-xs text-emerald-400/60 mt-0.5">ID: {result.email?.messageId}</p>
              </div>
            </div>

            {/* Detected Tracking */}
            <div className="bg-overlay border border-line rounded-xl p-5">
              <h3 className="text-xs text-faint uppercase tracking-widest font-semibold mb-3">Detected Tracking</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-faint">GA4 Measurement IDs</span>
                  <span className="font-mono text-sm text-blue-300">
                    {result.scrapeReport.measurementIds.length > 0 ? result.scrapeReport.measurementIds.join(', ') : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-faint">GTM Containers</span>
                  <span className="font-mono text-sm text-blue-300">
                    {result.scrapeReport.gtmContainers.map((c: any) => c.id).join(', ') || 'None'}
                  </span>
                </div>
                {result.scrapeReport.legacyUA.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-400">&#9888; Legacy UA (deprecated)</span>
                    <span className="font-mono text-sm text-amber-300">{result.scrapeReport.legacyUA.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Implemented', value: `${result.diff.summary.implemented}/${result.diff.summary.totalRecommended}`, color: 'text-blue-400' },
                { label: 'MUST HAVE Missing', value: result.diff.summary.mustHaveMissing, color: 'text-red-400' },
                { label: 'Total Missing', value: result.diff.summary.missing, color: 'text-amber-400' },
                { label: 'Extra Events', value: result.diff.summary.extraEventsFound, color: 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-overlay border border-line rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-faint mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Event Comparison */}
            <div className="bg-overlay border border-line rounded-xl p-5">
              <h3 className="text-xs text-faint uppercase tracking-widest font-semibold mb-3">Event-by-Event Comparison</h3>
              <div className="space-y-2">
                {result.diff.comparison.map((c: any, i: number) => {
                  const pri = priColor(c.priority);
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                      <span className="text-lg shrink-0">
                        {c.status === 'implemented' ? '\u2705' : '\u274C'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <code className="text-sm text-blue-300 font-mono">{c.name}</code>
                        {c.description && <p className="text-xs text-faint mt-0.5 truncate">{c.description}</p>}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${pri.bg} ${pri.text} ${pri.border}`}>
                        {c.priority} HAVE
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Extra Events */}
            {result.diff.extraEvents.length > 0 && (
              <div className="bg-overlay border border-line rounded-xl p-5">
                <h3 className="text-xs text-faint uppercase tracking-widest font-semibold mb-3">Extra Events Detected (not in plan)</h3>
                <div className="flex flex-wrap gap-2">
                  {result.diff.extraEvents.map((e: string, i: number) => (
                    <span key={i} className="font-mono text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/15 px-2.5 py-1 rounded-md">{e}</span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
