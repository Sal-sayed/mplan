'use client';

// Phase A implementation guidance (DISPLAY + APPROVAL-ACK ONLY). Renders the
// derived ImplementationProposal: per event, the proposed GTM trigger + GA4 tag +
// dataLayer push, with a why-explanation. The "Approve" action only records
// approval in local state — it executes NOTHING, makes no GTM/Google call. A
// banner makes clear that auto-applying to GTM is a separate, later step.

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Wrench, CheckCircle2, Copy, Check, Star, Info, ExternalLink, GitPullRequest } from 'lucide-react';
import type { ImplementationProposal, ProposalItem } from '@/lib/measurement/implementation-proposal';
import type { MeasurementPlan } from '@/lib/measurement/types';
import { runApproveApply } from '@/lib/measurement/approve-apply';
import { classifyEvents, TRIGGER_LABEL } from '@/lib/measurement/event-routing';

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

interface Ga4Result {
  propertyId: string;
  measurementId: string; // G-XXXXXXX
  displayName: string;
  accountName: string;
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

  // Split: what GTM can capture on its own vs what needs a developer-placed push.
  const { gtmCapturable, needsRichPush } = classifyEvents(plan);

  // ── Phase B apply (write to an UNPUBLISHED GTM workspace) ──
  // canConnect = signed-in OR admin (allowed to grant a write token at all);
  // canWrite = already holds the tagmanager.edit.containers scope.
  const [writeStatus, setWriteStatus] = useState<{ canConnect: boolean; canWrite: boolean } | null>(null);
  const [containerId, setContainerId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [metaPixel, setMetaPixel] = useState('');
  const [applyState, setApplyState] = useState<'idle' | 'applying' | 'done' | 'error'>('idle');
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState('');

  // ── Create a BRAND-NEW container, then populate it (no existing GTM-XXXX needed) ──
  const [createName, setCreateName] = useState('');
  const [createMeasurementId, setCreateMeasurementId] = useState('');
  const [createMetaPixel, setCreateMetaPixel] = useState('');
  const [createAccountId, setCreateAccountId] = useState('');
  const [accountOptions, setAccountOptions] = useState<GtmAccount[]>([]);
  const [createState, setCreateState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [createError, setCreateError] = useState('');

  // ── Create a brand-new GA4 property (needs analytics.edit) ──
  const [ga4Name, setGa4Name] = useState('');
  const [ga4TimeZone, setGa4TimeZone] = useState('');
  const [ga4Currency, setGa4Currency] = useState('');
  const [ga4AccountId, setGa4AccountId] = useState('');
  const [ga4AccountOptions, setGa4AccountOptions] = useState<GtmAccount[]>([]);
  const [ga4State, setGa4State] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');
  const [ga4Result, setGa4Result] = useState<Ga4Result | null>(null);
  const [ga4Error, setGa4Error] = useState('');

  // ── GitHub repo (for the assistive dataLayer PR — a SEPARATE file, never edits
  //    handlers) + that PR's result. Approve opens it too when a repo is connected. ──
  const [ghRepos, setGhRepos] = useState<{ fullName: string; owner: string; name: string }[]>([]);
  const [ghRepo, setGhRepo] = useState('');
  const [dlState, setDlState] = useState<'idle' | 'opening' | 'done' | 'skipped' | 'error'>('idle');
  const [dlResult, setDlResult] = useState<{ prUrl: string; prNumber: number; eventCount: number } | null>(null);
  const [dlMessage, setDlMessage] = useState('');

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

  // Load the connected GitHub repos (for the assistive dataLayer PR). Auto-select
  // the first so Approve can open the PR without extra clicks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch('/api/github/status');
        const s = sRes.ok ? await sRes.json() : {};
        if (cancelled || !s.connected) return;
        const rRes = await fetch('/api/github/repos');
        if (!cancelled && rRes.ok) {
          const d = await rRes.json();
          const repos = Array.isArray(d.repos) ? d.repos : [];
          setGhRepos(repos);
          if (repos[0]) setGhRepo(repos[0].fullName);
        }
      } catch {
        /* no GitHub — the dataLayer PR step is simply skipped on approve */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const connectForWrite = () => window.open('/api/google/oauth/start-write', 'gtm_write', 'width=520,height=680');

  const applyToGtm = async () => {
    setApplyState('applying'); setApplyError('');
    try {
      const res = await fetch('/api/implementation/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, gtm: { containerId }, measurementId, metaPixelId: metaPixel }),
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
        body: JSON.stringify({ plan, containerName: createName, measurementId: createMeasurementId, metaPixelId: createMetaPixel, accountId: createAccountId || undefined }),
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

  // Create a brand-new GA4 property + web data stream → returns the Measurement ID.
  const createGa4 = async () => {
    setGa4State('creating'); setGa4Error('');
    try {
      const res = await fetch('/api/implementation/create-ga4', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, displayName: ga4Name, timeZone: ga4TimeZone, currencyCode: ga4Currency, accountId: ga4AccountId || undefined }),
      });
      const json = await res.json();
      if (res.status === 409 && json.needsWriteConnect) {
        setGa4Error('Connect Google for write access first.'); setGa4State('error'); fetchWriteStatus(); return;
      }
      if (res.status === 409 && json.needsAccount) {
        setGa4AccountOptions(Array.isArray(json.accounts) ? json.accounts : []);
        setGa4Error('You have more than one Analytics account — pick which one to create the property in, then try again.');
        setGa4State('idle');
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not create the GA4 property.');
      setGa4Result(json.result as Ga4Result); setGa4State('done');
    } catch (e) {
      setGa4Error(e instanceof Error ? e.message : 'Could not create the GA4 property.'); setGa4State('error');
    }
  };

  // The assistive dataLayer PR — a SEPARATE reference file with snippets + placement
  // TODOs. It NEVER edits the developer's handlers/business logic.
  const openDataLayerPr = async () => {
    const repo = ghRepos.find((r) => r.fullName === ghRepo);
    if (!repo) { setDlState('skipped'); setDlMessage('Connect GitHub to also get the dataLayer snippets as a PR.'); return; }
    setDlState('opening'); setDlMessage('');
    try {
      const res = await fetch('/api/github/inject-datalayer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.name, plan }),
      });
      const j = await res.json();
      if (!res.ok || j.status === 'error') { setDlState('error'); setDlMessage(j.error || 'Could not open the dataLayer PR.'); return; }
      if (j.status === 'none_needed') { setDlState('skipped'); setDlMessage(j.message || 'All events are captured by GTM — no dataLayer pushes need placing.'); return; }
      setDlResult(j); setDlState('done');
    } catch {
      setDlState('error'); setDlMessage('Network error opening the dataLayer PR.');
    }
  };

  // Approve → run the two existing SAFE actions together (for convenience): the GTM
  // unpublished-workspace apply (auto-create container) + the assistive dataLayer PR
  // when a repo is connected. The standalone buttons below still work on their own.
  const approveAndApply = async () => {
    setApproved(true);
    fetchWriteStatus();
    const outcome = await runApproveApply({
      githubConnected: Boolean(ghRepo),
      applyToGtm: createNewContainer, // existing unpublished-workspace create (no manual IDs)
      openDataLayerPr,
    });
    if (!outcome.dataLayerPrOpened && outcome.skippedReason) {
      setDlState('skipped'); setDlMessage(outcome.skippedReason);
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

          {/* The split — what GTM captures on its own vs what needs a placed push. */}
          <div className="rounded-2xl border border-line bg-overlay p-5 space-y-3">
            <p className="text-sm font-semibold text-ink">How each event is handled</p>
            <div>
              <p className="text-xs font-medium text-emerald-300 flex items-center gap-1.5"><Check size={13} /> Handled automatically in GTM (no code) — via built-in triggers</p>
              {gtmCapturable.length ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {gtmCapturable.map((g) => (
                    <span key={g.event.id} className="inline-flex items-center gap-2 flex-wrap">
                      <code className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 font-mono">{g.event.name}</code>
                      <span className="text-[10px] text-emerald-300/80">captured via {TRIGGER_LABEL[g.trigger]} — no code</span>
                    </span>
                  ))}
                </div>
              ) : <p className="text-[11px] text-faint mt-1">None — every event carries data that needs placing.</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5"><GitPullRequest size={13} /> Needs a dataLayer push you place in your code</p>
              {needsRichPush.length ? (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {needsRichPush.map((e) => <code key={e.id} className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 font-mono">{e.name}</code>)}
                  </div>
                  <p className="text-[10px] text-faint mt-1.5">These carry app data GTM can&apos;t read from the page. They come as a file via PR — place each in the right handler (the component where the action happens, <span className="text-muted">not</span> index.html) and verify. The snippets are below.</p>
                </>
              ) : <p className="text-[11px] text-faint mt-1">None — GTM captures everything; no source code needed.</p>}
            </div>
          </div>

          {/* Summary + approve */}
          <div className="rounded-2xl border border-line bg-overlay p-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink font-semibold">{summary.totalEvents} event{summary.totalEvents === 1 ? '' : 's'} to implement</p>
              <p className="text-xs text-faint mt-0.5">{summary.keyEvents} key event{summary.keyEvents === 1 ? '' : 's'} · {summary.tagCount} GA4 tag{summary.tagCount === 1 ? '' : 's'} proposed</p>
            </div>
            {approved ? (
              <span className="text-sm text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={16} /> Approved — applying below</span>
            ) : (
              <div className="flex flex-col items-stretch gap-2 shrink-0">
                {ghRepos.length > 0 && (
                  <select value={ghRepo} onChange={(e) => setGhRepo(e.target.value)}
                    className="bg-overlay border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500/40">
                    {ghRepos.map((r) => <option key={r.fullName} value={r.fullName}>dataLayer PR → {r.fullName}</option>)}
                  </select>
                )}
                <button onClick={approveAndApply}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-onaccent font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition">
                  Approve &amp; apply
                </button>
                <p className="text-[10px] text-faint max-w-[14rem]">Creates an unpublished GTM workspace{ghRepos.length > 0 ? ' + opens a PR with your dataLayer snippets to place' : ''}. Nothing publishes or merges automatically.</p>
              </div>
            )}
          </div>

          {/* dataLayer assistive PR result (from Approve) — a separate file you place + verify. */}
          {approved && dlState !== 'idle' && (
            <div className="rounded-2xl border border-line bg-overlay p-4 text-sm space-y-1">
              <p className="font-semibold text-ink flex items-center gap-1.5"><GitPullRequest size={15} className="text-blue-400" /> dataLayer snippets (assistive PR)</p>
              {dlState === 'opening' && <p className="text-xs text-faint">Opening a PR with your dataLayer snippets…</p>}
              {dlState === 'done' && dlResult && (
                <p className="text-xs text-emerald-200">
                  PR opened with {dlResult.eventCount} snippet{dlResult.eventCount === 1 ? '' : 's'} to place —{' '}
                  <a href={dlResult.prUrl} target="_blank" rel="noreferrer" className="underline text-emerald-100">review, place &amp; merge #{dlResult.prNumber} →</a>.{' '}
                  These are in a file for you to place into your handlers and verify — nothing was auto-wired into your code.
                </p>
              )}
              {dlState === 'skipped' && <p className="text-xs text-amber-300">{dlMessage}</p>}
              {dlState === 'error' && <p className="text-xs text-rose-400">{dlMessage}</p>}
            </div>
          )}

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
                  <input value={metaPixel} onChange={(e) => setMetaPixel(e.target.value)} placeholder="Meta Pixel ID — optional (numeric)"
                    className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
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
                  <input value={createMetaPixel} onChange={(e) => setCreateMetaPixel(e.target.value)} placeholder="Meta Pixel ID — optional (numeric)"
                    className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
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
                  <p className="text-[10px] text-faint">GA4 &amp; Meta IDs are optional — add either to include those tags. The container, variables &amp; triggers are still created. Nothing is published.</p>

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

                  {/* divider */}
                  <div className="flex items-center gap-2 py-1">
                    <span className="h-px flex-1 bg-line" /><span className="text-[10px] uppercase tracking-widest text-faint">or</span><span className="h-px flex-1 bg-line" />
                  </div>

                  {/* Option C — CREATE a brand-new GA4 property (gives you a G-XXXX). */}
                  <p className="text-[11px] text-faint">…or create a brand-new GA4 property for this site (gives you a Measurement ID):</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={ga4Name} onChange={(e) => setGa4Name(e.target.value)} placeholder={`Property name (default: ${url || 'your site'})`}
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                    <input value={ga4TimeZone} onChange={(e) => setGa4TimeZone(e.target.value)} placeholder="Time zone — optional (e.g. Asia/Kolkata)"
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={ga4Currency} onChange={(e) => setGa4Currency(e.target.value)} placeholder="Currency — optional (e.g. USD, INR)"
                      className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-cyan-500/40" />
                    {ga4AccountOptions.length > 0 && (
                      <select value={ga4AccountId} onChange={(e) => setGa4AccountId(e.target.value)}
                        className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-cyan-500/40">
                        <option value="">Choose an Analytics account…</option>
                        {ga4AccountOptions.map((a) => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
                      </select>
                    )}
                  </div>
                  <button onClick={createGa4} disabled={ga4State === 'creating' || (ga4AccountOptions.length > 0 && !ga4AccountId)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-onaccent font-semibold text-sm hover:shadow-lg hover:shadow-amber-500/20 transition disabled:opacity-60">
                    {ga4State === 'creating' ? 'Creating GA4 property…' : 'Create a new GA4 property'}
                  </button>
                  <p className="text-[10px] text-faint">Creates the property + a web data stream and returns the Measurement ID (G-XXXXXXX). Defaults: time zone UTC, currency USD — change anytime in GA4.</p>

                  {ga4Error && ga4State !== 'error' && <p className="text-xs text-amber-300">{ga4Error}</p>}
                  {ga4State === 'error' && <p className="text-sm text-rose-400">{ga4Error}</p>}
                  {ga4State === 'done' && ga4Result && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 space-y-1.5">
                      <p className="text-sm text-amber-200 font-medium flex items-center gap-1.5"><CheckCircle2 size={15} /> GA4 property created</p>
                      <p className="text-sm text-ink">Measurement ID: <code className="font-mono font-semibold text-amber-200">{ga4Result.measurementId}</code></p>
                      <p className="text-xs text-faint">Property “{ga4Result.displayName}” (id {ga4Result.propertyId}) in {ga4Result.accountName}.</p>
                      <p className="text-[11px] text-blue-200/90">Next: paste <code className="font-mono">{ga4Result.measurementId}</code> into the “GA4 Measurement ID” box above when you create the GTM container, so the GA4 tags get added too.</p>
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
