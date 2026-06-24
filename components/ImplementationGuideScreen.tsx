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

interface CreateResult extends ApplyResult {
  newContainerId: string; // the brand-new GTM-XXXX
  accountName: string;
}

interface GtmAccount {
  accountId: string;
  name: string;
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
      <pre className="text-[12px] leading-relaxed text-muted bg-black/30 border border-line rounded-lg p-3 overflow-x-auto font-mono whitespace-pre">{code}</pre>
      <button onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded-md bg-overlay border border-line-strong text-[11px] text-muted hover:bg-overlay-strong transition flex items-center gap-1">
        {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
      </button>
    </div>
  );
}

function Item({ item }: { item: ProposalItem }) {
  return (
    <div className={`rounded-2xl border ${item.isKeyEvent ? 'border-amber-500/25 bg-amber-500/[0.04]' : 'border-line bg-overlay'} p-5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-sm font-semibold text-ink font-mono break-all">{item.eventName}</code>
        {item.isKeyEvent && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold flex items-center gap-1"><Star size={9} /> key event</span>
        )}
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-overlay text-faint">{item.category}</span>
      </div>

      {/* WHY — prominent */}
      <p className="text-sm text-muted mt-3">
        <span className="text-faint">Why: </span>{item.explanation}
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* Trigger */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">GTM trigger</p>
          <p className="text-sm text-ink font-medium">{item.trigger.type}</p>
          <p className="text-xs text-faint mt-0.5">{item.trigger.condition}</p>
        </div>
        {/* Tag */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">GA4 event tag</p>
          <p className="text-sm text-ink font-medium">{item.tag.name}</p>
          <p className="text-xs text-faint mt-0.5">Sends GA4 event <code className="text-muted">{item.tag.ga4EventName}</code></p>
          {item.tag.parameters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.tag.parameters.map((p) => (
                <span key={p.name} className="text-[11px] px-2 py-0.5 rounded bg-overlay border border-line text-muted font-mono">
                  {p.name} = {p.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* dataLayer push */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">dataLayer push (add to the site)</p>
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
  // canConnect = signed-in OR admin (allowed to grant a write token at all);
  // canWrite = already holds the tagmanager.edit.containers scope.
  const [writeStatus, setWriteStatus] = useState<{ canConnect: boolean; canWrite: boolean } | null>(null);
  const [containerId, setContainerId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [applyState, setApplyState] = useState<'idle' | 'applying' | 'done' | 'error'>('idle');
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState('');

  // ── Create a BRAND-NEW container, then populate it (no existing GTM-XXXX needed) ──
  const [createName, setCreateName] = useState('');
  const [createMeasurementId, setCreateMeasurementId] = useState('');
  const [createAccountId, setCreateAccountId] = useState('');
  const [accountOptions, setAccountOptions] = useState<GtmAccount[]>([]);
  const [createState, setCreateState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [createError, setCreateError] = useState('');

  const fetchWriteStatus = useCallback(async () => {
    try {
      const [sRes, meRes] = await Promise.all([fetch('/api/google/status'), fetch('/api/auth/me')]);
      const s = sRes.ok ? await sRes.json() : {};
      const me = meRes.ok ? await meRes.json() : {};
      const canWrite = Array.isArray(s.scopes) && s.scopes.some((x: string) => x.includes('tagmanager.edit.containers'));
      const canConnect = Boolean(me.user) || Boolean(s.isAdmin); // signed-in user or admin
      setWriteStatus({ canConnect, canWrite });
    } catch {
      setWriteStatus({ canConnect: false, canWrite: false });
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

  // Create a brand-new container + populate it. The app makes the GTM-XXXX, so the
  // user doesn't need to own one first. Still no publish.
  const createNewContainer = async () => {
    setCreateState('creating'); setCreateError('');
    try {
      const res = await fetch('/api/implementation/create-container', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, containerName: createName, measurementId: createMeasurementId, accountId: createAccountId || undefined }),
      });
      const json = await res.json();
      if (res.status === 409 && json.needsWriteConnect) {
        setCreateError('Connect Google for write access first.'); setCreateState('error'); fetchWriteStatus(); return;
      }
      if (res.status === 409 && json.needsAccount) {
        // More than one GTM account — let the user pick which to create under.
        setAccountOptions(Array.isArray(json.accounts) ? json.accounts : []);
        setCreateError('You have more than one Tag Manager account — pick which one to create the container in, then try again.');
        setCreateState('idle');
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not create the container.');
      setCreateResult(json.result as CreateResult); setCreateState('done');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the container.'); setCreateState('error');
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-app overflow-hidden">
      <header className="shrink-0 h-16 px-4 lg:px-6 flex items-center gap-3 border-b border-line bg-surface">
        {onReset && (
          <button onClick={onReset} aria-label="Back" className="p-2 rounded-lg hover:bg-overlay text-faint hover:text-muted transition shrink-0">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate flex items-center gap-2"><Wrench size={15} className="text-cyan-400" /> Implementation guide</div>
          {url && <div className="text-xs text-faint truncate">{url}</div>}
        </div>
      </header>

      <div className="flex-1 scroll-area bg-app overflow-y-auto">
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
          <div className="rounded-2xl border border-line bg-overlay p-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink font-semibold">{summary.totalEvents} event{summary.totalEvents === 1 ? '' : 's'} to implement</p>
              <p className="text-xs text-faint mt-0.5">{summary.keyEvents} key event{summary.keyEvents === 1 ? '' : 's'} · {summary.tagCount} GA4 tag{summary.tagCount === 1 ? '' : 's'} proposed</p>
            </div>
            {approved ? (
              <span className="text-sm text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={16} /> Approved — nothing was applied to GTM</span>
            ) : (
              <button onClick={() => { setApproved(true); fetchWriteStatus(); }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-onaccent font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition shrink-0">
                Approve this implementation plan
              </button>
            )}
          </div>

          {/* Apply to GTM (only after approval) — creates an UNPUBLISHED workspace */}
          {approved && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Wrench size={15} className="text-cyan-400" />
                <p className="text-sm font-semibold text-ink">Apply to GTM — creates an unpublished workspace</p>
              </div>
              <p className="text-xs text-faint">
                This creates the variables, triggers, and GA4 tags in a <span className="text-muted">new GTM workspace</span>. It does <span className="text-muted">not publish</span> — you review and Publish in Tag Manager yourself, so nothing goes live until you say so.
              </p>

              {!writeStatus ? (
                <p className="text-[11px] text-faint">Checking your Google connection…</p>
              ) : !writeStatus.canConnect ? (
                <div>
                  <p className="text-[11px] text-faint mb-2">Sign in first to connect Google and apply to GTM.</p>
                  <a href="/signin"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-contrast text-contrast-ink text-xs font-semibold hover:opacity-90 transition">
                    Sign in
                  </a>
                </div>
              ) : !writeStatus.canWrite ? (
                <div>
                  <p className="text-[11px] text-faint mb-2">Writing to GTM needs a separate, one-time write consent (your current connection is read-only).</p>
                  <button onClick={connectForWrite}
                    className="px-3 py-1.5 rounded-lg bg-overlay border border-line-strong text-ink text-xs font-medium hover:bg-overlay-strong transition flex items-center gap-1.5">
                    <ExternalLink size={12} /> Connect Google for write
                  </button>
                </div>
              ) : (
                <>
                  {/* Option A — populate a container you ALREADY have. */}
                  <p className="text-[11px] text-faint">Use a GTM container you already have:</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={containerId} onChange={(e) => setContainerId(e.target.value)} placeholder="GTM container — GTM-XXXXXXX"
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                    <input value={measurementId} onChange={(e) => setMeasurementId(e.target.value)} placeholder="GA4 Measurement ID — G-XXXXXXX"
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                  </div>
                  <button onClick={applyToGtm} disabled={applyState === 'applying'}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-onaccent font-semibold text-sm hover:shadow-lg hover:shadow-cyan-500/20 transition disabled:opacity-60">
                    {applyState === 'applying' ? 'Creating workspace…' : 'Create GTM workspace (no publish)'}
                  </button>

                  {/* divider */}
                  <div className="flex items-center gap-2 py-1">
                    <span className="h-px flex-1 bg-line" /><span className="text-[10px] uppercase tracking-widest text-faint">or</span><span className="h-px flex-1 bg-line" />
                  </div>

                  {/* Option B — CREATE a brand-new container (no GTM-XXXX needed). */}
                  <p className="text-[11px] text-faint">…or let the app create a brand-new GTM container for this site:</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={`Container name (default: ${url || 'your site'})`}
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                    <input value={createMeasurementId} onChange={(e) => setCreateMeasurementId(e.target.value)} placeholder="GA4 Measurement ID — optional (G-XXXXXXX)"
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                  </div>
                  {accountOptions.length > 0 && (
                    <select value={createAccountId} onChange={(e) => setCreateAccountId(e.target.value)}
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-cyan-500/40">
                      <option value="">Choose a Tag Manager account…</option>
                      {accountOptions.map((a) => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
                    </select>
                  )}
                  <button onClick={createNewContainer} disabled={createState === 'creating' || (accountOptions.length > 0 && !createAccountId)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-onaccent font-semibold text-sm hover:shadow-lg hover:shadow-emerald-500/20 transition disabled:opacity-60">
                    {createState === 'creating' ? 'Creating container…' : 'Create a new GTM container (no publish)'}
                  </button>
                  <p className="text-[10px] text-faint">Leave the GA4 ID blank to add GA4 later — the container, variables &amp; triggers are still created. Nothing is published.</p>

                  {createError && createState !== 'error' && <p className="text-xs text-amber-300">{createError}</p>}
                  {createState === 'error' && <p className="text-sm text-rose-400">{createError}</p>}
                  {createState === 'done' && createResult && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 space-y-1.5">
                      <p className="text-sm text-emerald-200 font-medium flex items-center gap-1.5"><CheckCircle2 size={15} /> Container created — nothing published</p>
                      <p className="text-sm text-ink">New container: <code className="font-mono font-semibold text-emerald-200">{createResult.newContainerId}</code> <span className="text-faint">in {createResult.accountName}</span></p>
                      <p className="text-xs text-faint">
                        {createResult.created.tags.length} tag(s), {createResult.created.triggers.length} trigger(s), {createResult.created.variables.length} variable(s) created.
                      </p>
                      {createResult.failures.length > 0 && (
                        <p className="text-xs text-amber-300">{createResult.failures.length} item(s) need manual attention: {createResult.failures.map((f) => f.item).join(', ')}.</p>
                      )}
                      <p className="text-[11px] text-blue-200/90">Next: use <code className="font-mono">{createResult.newContainerId}</code> in the “Connect GitHub” step to add it to your site via a pull request.</p>
                      <a href={createResult.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 underline">
                        Review &amp; publish in Tag Manager <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </>
              )}

              {applyState === 'error' && <p className="text-sm text-rose-400">{applyError}</p>}
              {applyState === 'done' && applyResult && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 space-y-1.5">
                  <p className="text-sm text-emerald-200 font-medium flex items-center gap-1.5"><CheckCircle2 size={15} /> Workspace created — nothing published</p>
                  <p className="text-xs text-muted break-all">{applyResult.workspaceName}</p>
                  <p className="text-xs text-faint">
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
