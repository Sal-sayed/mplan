'use client';

// Phase A implementation guidance (DISPLAY + APPROVAL-ACK ONLY). Renders the
// derived ImplementationProposal: per event, the proposed GTM trigger + GA4 tag +
// dataLayer push, with a why-explanation. The "Approve" action only records
// approval in local state — it executes NOTHING, makes no GTM/Google call. A
// banner makes clear that auto-applying to GTM is a separate, later step.

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Wrench, CheckCircle2, Copy, Check, Star, Info, ExternalLink } from 'lucide-react';
import type { ImplementationProposal, ProposalItem } from '@/lib/measurement/implementation-proposal';
import type { MeasurementPlan } from '@/lib/measurement/types';

interface ApplyResult {
  workspaceName: string;
  reviewUrl: string;
  created: { variables: string[]; triggers: string[]; tags: string[] };
  skipped: { variables: string[]; triggers: string[]; tags: string[] };
  failures: { item: string; error: string }[];
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <pre className="text-[12px] leading-relaxed text-slate-200 bg-black/30 border border-white/[0.08] rounded-lg p-3 overflow-x-auto font-mono whitespace-pre">{code}</pre>
      <button onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded-md bg-white/[0.06] border border-white/[0.1] text-[11px] text-slate-300 hover:bg-white/[0.12] transition flex items-center gap-1">
        {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
      </button>
    </div>
  );
}

function Item({ item }: { item: ProposalItem }) {
  return (
    <div className={`rounded-2xl border ${item.isKeyEvent ? 'border-amber-500/25 bg-amber-500/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'} p-5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-sm font-semibold text-white font-mono break-all">{item.eventName}</code>
        {item.isKeyEvent && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold flex items-center gap-1"><Star size={9} /> key event</span>
        )}
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">{item.category}</span>
      </div>

      {/* WHY — prominent */}
      <p className="text-sm text-slate-200 mt-3">
        <span className="text-slate-500">Why: </span>{item.explanation}
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* Trigger */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">GTM trigger</p>
          <p className="text-sm text-white font-medium">{item.trigger.type}</p>
          <p className="text-xs text-slate-400 mt-0.5">{item.trigger.condition}</p>
        </div>
        {/* Tag */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">GA4 event tag</p>
          <p className="text-sm text-white font-medium">{item.tag.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">Sends GA4 event <code className="text-slate-300">{item.tag.ga4EventName}</code></p>
          {item.tag.parameters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.tag.parameters.map((p) => (
                <span key={p.name} className="text-[11px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-300 font-mono">
                  {p.name} = {p.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* dataLayer push */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">dataLayer push (add to the site)</p>
        <CodeBlock code={item.dataLayerSnippet} />
      </div>
    </div>
  );
}

export default function ImplementationGuideScreen({
  proposal,
  plan,
  url,
  onReset,
}: {
  proposal: ImplementationProposal;
  plan: MeasurementPlan;
  url?: string;
  onReset?: () => void;
}) {
  const [approved, setApproved] = useState(false);
  const { summary, items } = proposal;

  // ── Phase B apply (write to an UNPUBLISHED GTM workspace) ──
  const [writeStatus, setWriteStatus] = useState<{ connected: boolean; canWrite: boolean } | null>(null);
  const [containerId, setContainerId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [applyState, setApplyState] = useState<'idle' | 'applying' | 'done' | 'error'>('idle');
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState('');

  const fetchWriteStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/google/status');
      const d = r.ok ? await r.json() : {};
      const canWrite = Array.isArray(d.scopes) && d.scopes.some((s: string) => s.includes('tagmanager.edit.containers'));
      setWriteStatus({ connected: Boolean(d.connected), canWrite });
    } catch {
      setWriteStatus({ connected: false, canWrite: false });
    }
  }, []);

  // The write-consent popup posts back here when it finishes.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.source !== 'google-oauth') return;
      if (e.data.status === 'connected') fetchWriteStatus();
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [fetchWriteStatus]);

  const connectForWrite = () => window.open('/api/google/oauth/start-write', 'gtm_write', 'width=520,height=680');

  const applyToGtm = async () => {
    setApplyState('applying'); setApplyError('');
    try {
      const res = await fetch('/api/implementation/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, gtm: { containerId }, measurementId }),
      });
      const json = await res.json();
      if (res.status === 409 && json.needsWriteConnect) {
        setApplyError('Connect Google for write access first.');
        setApplyState('error');
        fetchWriteStatus();
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not apply to GTM.');
      setApplyResult(json.result as ApplyResult);
      setApplyState('done');
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Could not apply to GTM.');
      setApplyState('error');
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0b1120] overflow-hidden">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center gap-3 border-b border-white/[0.08] bg-[#0d1525]">
        {onReset && (
          <button onClick={onReset} aria-label="Back" className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition shrink-0">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate flex items-center gap-2"><Wrench size={15} className="text-cyan-400" /> Implementation guide</div>
          {url && <div className="text-xs text-slate-400 truncate">{url}</div>}
        </div>
      </header>

      <div className="flex-1 scroll-area bg-[#0b1120] overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
          {/* Review-only banner — Phase B (auto-apply) is separate */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4 flex items-start gap-3">
            <Info size={16} className="text-blue-300 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-100/90">
              <span className="font-semibold">Review-only.</span> This is what to add to GTM and your site to implement the plan. Nothing here is written to GTM —
              <span className="text-blue-200"> auto-applying is a separate step coming later</span>. For now, copy these into GTM / your site manually.
            </p>
          </div>

          {/* Summary + approve */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-semibold">{summary.totalEvents} event{summary.totalEvents === 1 ? '' : 's'} to implement</p>
              <p className="text-xs text-slate-400 mt-0.5">{summary.keyEvents} key event{summary.keyEvents === 1 ? '' : 's'} · {summary.tagCount} GA4 tag{summary.tagCount === 1 ? '' : 's'} proposed</p>
            </div>
            {approved ? (
              <span className="text-sm text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={16} /> Approved — nothing was applied to GTM</span>
            ) : (
              <button onClick={() => { setApproved(true); fetchWriteStatus(); }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition shrink-0">
                Approve this implementation plan
              </button>
            )}
          </div>

          {/* Apply to GTM (only after approval) — creates an UNPUBLISHED workspace */}
          {approved && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Wrench size={15} className="text-cyan-400" />
                <p className="text-sm font-semibold text-white">Apply to GTM — creates an unpublished workspace</p>
              </div>
              <p className="text-xs text-slate-400">
                This creates the variables, triggers, and GA4 tags in a <span className="text-slate-200">new GTM workspace</span>. It does <span className="text-slate-200">not publish</span> — you review and Publish in Tag Manager yourself, so nothing goes live until you say so.
              </p>

              {writeStatus && !writeStatus.canWrite ? (
                <div>
                  <p className="text-[11px] text-slate-500 mb-2">Writing to GTM needs a separate, one-time write consent (your current connection is read-only).</p>
                  <button onClick={connectForWrite}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-slate-100 text-xs font-medium hover:bg-white/[0.12] transition flex items-center gap-1.5">
                    <ExternalLink size={12} /> Connect Google for write
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={containerId} onChange={(e) => setContainerId(e.target.value)} placeholder="GTM container — GTM-XXXXXXX"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40" />
                    <input value={measurementId} onChange={(e) => setMeasurementId(e.target.value)} placeholder="GA4 Measurement ID — G-XXXXXXX"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40" />
                  </div>
                  <button onClick={applyToGtm} disabled={applyState === 'applying'}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-cyan-500/20 transition disabled:opacity-60">
                    {applyState === 'applying' ? 'Creating workspace…' : 'Create GTM workspace (no publish)'}
                  </button>
                </>
              )}

              {applyState === 'error' && <p className="text-sm text-rose-400">{applyError}</p>}
              {applyState === 'done' && applyResult && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 space-y-1.5">
                  <p className="text-sm text-emerald-200 font-medium flex items-center gap-1.5"><CheckCircle2 size={15} /> Workspace created — nothing published</p>
                  <p className="text-xs text-slate-300 break-all">{applyResult.workspaceName}</p>
                  <p className="text-xs text-slate-400">
                    {applyResult.created.tags.length} tag(s), {applyResult.created.triggers.length} trigger(s), {applyResult.created.variables.length} variable(s) created
                    {applyResult.skipped.tags.length + applyResult.skipped.triggers.length > 0 ? ' · some already existed (skipped)' : ''}.
                  </p>
                  {applyResult.failures.length > 0 && (
                    <p className="text-xs text-amber-300">{applyResult.failures.length} item(s) need manual attention: {applyResult.failures.map((f) => f.item).join(', ')}.</p>
                  )}
                  <a href={applyResult.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 underline">
                    Review &amp; publish in Tag Manager <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Items — key events already sorted first by the derivation */}
          <div className="space-y-3">
            {items.map((item) => <Item key={item.eventId} item={item} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
