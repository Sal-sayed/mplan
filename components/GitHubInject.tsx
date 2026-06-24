'use client';

// One-stop measurement setup, in the readiness panel:
//   1) CREATE in GTM — a new GTM container populated from the plan, plus (optional)
//      a new GA4 property and (optional) Meta Pixel tags. Uses the Google
//      "Connect for write" grant. Nothing is published.
//   2) ADD TO SITE — open a GitHub PR injecting the (new or existing) GTM snippet
//      into the site's <head>. Never pushes to the default branch, never merges.
// Self-contained; mirrors the Connect-Google/Connect-GitHub popup + postMessage.

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, GitPullRequest, Check, Loader2, ClipboardCopy, ShieldCheck, Sparkles } from 'lucide-react';
import type { MeasurementPlan } from '@/lib/measurement/types';

interface GhStatus { configured: boolean; connected: boolean; login?: string; }
interface GWriteStatus { configured: boolean; connected: boolean; canWrite: boolean; }
interface RepoSummary { fullName: string; owner: string; name: string; private: boolean; defaultBranch: string; }
interface Account { accountId: string; name: string; }
interface CreateResult { gtmContainerId: string; measurementId?: string; metaCreated: boolean; }

type InjectResult =
  | { status: 'pr_opened'; filePath: string; base: string; prUrl: string; prNumber: number }
  | { status: 'already_installed'; filePath: string; message: string }
  | { status: 'manual'; message: string; pasteSnippet: string }
  | { status: 'error'; error: string; pasteSnippet?: string };

export default function GitHubInject({ plan, defaultContainerId = '' }: { plan: MeasurementPlan; defaultContainerId?: string }) {
  // ── GitHub (inject to site) ──
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [typed, setTyped] = useState('');
  const containerId = typed || defaultContainerId;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InjectResult | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Google write (create in GTM/GA4) ──
  const [gWrite, setGWrite] = useState<GWriteStatus | null>(null);
  const [wantGa4, setWantGa4] = useState(false);
  const [wantMeta, setWantMeta] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState('');
  const [containerName, setContainerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [createError, setCreateError] = useState('');
  const [gtmAccounts, setGtmAccounts] = useState<Account[]>([]);
  const [gtmAccountId, setGtmAccountId] = useState('');
  const [ga4Accounts, setGa4Accounts] = useState<Account[]>([]);
  const [ga4AccountId, setGa4AccountId] = useState('');

  const fetchStatus = useCallback(async () => {
    try { const res = await fetch('/api/github/status'); if (res.ok) setStatus(await res.json()); } catch { /* hidden */ }
  }, []);

  const fetchGoogle = useCallback(async () => {
    try {
      const res = await fetch('/api/google/status');
      if (res.ok) {
        const d = await res.json();
        const canWrite = Array.isArray(d.scopes) && d.scopes.some((s: string) => s.includes('tagmanager.edit.containers'));
        setGWrite({ configured: Boolean(d.configured), connected: Boolean(d.connected), canWrite });
      }
    } catch { /* leave null */ }
  }, []);

  // Initial status (async IIFE so setState isn't synchronous in the effect body).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const r = await fetch('/api/github/status'); if (!cancelled && r.ok) setStatus(await r.json()); } catch { /* hidden */ }
      try {
        const r = await fetch('/api/google/status');
        if (!cancelled && r.ok) {
          const d = await r.json();
          const canWrite = Array.isArray(d.scopes) && d.scopes.some((s: string) => s.includes('tagmanager.edit.containers'));
          setGWrite({ configured: Boolean(d.configured), connected: Boolean(d.connected), canWrite });
        }
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Repo list once GitHub is connected.
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/repos');
        if (!cancelled && res.ok) { const d = await res.json(); setRepos(Array.isArray(d.repos) ? d.repos : []); }
      } catch { /* empty */ }
    })();
    return () => { cancelled = true; };
  }, [status?.connected]);

  // Both OAuth popups post back here.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.source === 'github-oauth' && e.data.status === 'connected') fetchStatus();
      if (e.data?.source === 'google-oauth' && e.data.status === 'connected') fetchGoogle();
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [fetchStatus, fetchGoogle]);

  const connect = () => window.open('/api/github/start', 'github_oauth', 'width=620,height=720');
  const connectWrite = () => window.open('/api/google/oauth/start-write', 'gtm_write', 'width=520,height=680');
  const disconnect = async () => {
    setBusy(true);
    try { await fetch('/api/github/disconnect', { method: 'POST' }); setRepos([]); setSelected(''); setResult(null); await fetchStatus(); }
    finally { setBusy(false); }
  };

  // Step 1 — create in GTM (+ GA4 + Meta as chosen), then prefill the inject field.
  const createInGtm = async () => {
    setCreating(true); setCreateError('');
    try {
      let measurementId = '';
      if (wantGa4) {
        const r = await fetch('/api/implementation/create-ga4', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, accountId: ga4AccountId || undefined }),
        });
        const j = await r.json();
        if (r.status === 409 && j.needsWriteConnect) { setCreateError('Connect Google for write first, then try again.'); connectWrite(); return; }
        if (r.status === 409 && j.needsAccount) { setGa4Accounts(Array.isArray(j.accounts) ? j.accounts : []); setCreateError('You have more than one Analytics account — pick one below, then try again.'); return; }
        if (!r.ok || !j.success) throw new Error(j.error || 'Could not create the GA4 property.');
        measurementId = j.result.measurementId;
      }
      const r2 = await fetch('/api/implementation/create-container', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, containerName, measurementId, metaPixelId: wantMeta ? metaPixelId : '', accountId: gtmAccountId || undefined }),
      });
      const j2 = await r2.json();
      if (r2.status === 409 && j2.needsWriteConnect) { setCreateError('Connect Google for write first, then try again.'); connectWrite(); return; }
      if (r2.status === 409 && j2.needsAccount) { setGtmAccounts(Array.isArray(j2.accounts) ? j2.accounts : []); setCreateError('You have more than one Tag Manager account — pick one below, then try again.'); return; }
      if (!r2.ok || !j2.success) throw new Error(j2.error || 'Could not create the GTM container.');
      const gtmId = j2.result.newContainerId as string;
      setCreateResult({ gtmContainerId: gtmId, measurementId: measurementId || undefined, metaCreated: wantMeta && Boolean(metaPixelId) });
      setTyped(gtmId); // auto-fill the inject field below
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Setup failed.');
    } finally {
      setCreating(false);
    }
  };

  // Step 2 — open the PR adding the GTM snippet to the site.
  const inject = async () => {
    const repo = repos.find((r) => r.fullName === selected);
    if (!repo) return;
    setBusy(true); setResult(null); setCopied(false);
    try {
      const res = await fetch('/api/github/inject-gtm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.name, containerId: containerId.trim() }),
      });
      setResult((await res.json()) as InjectResult);
    } catch {
      setResult({ status: 'error', error: 'Network error reaching the server.' });
    } finally {
      setBusy(false);
    }
  };

  const copyPaste = async (snippet: string) => {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); } catch { /* blocked */ }
  };

  if (!status || !status.configured) return null;

  const validGtm = /^GTM-[A-Z0-9]+$/i.test(containerId.trim());
  const metaOk = !wantMeta || /^\d{10,20}$/.test(metaPixelId.trim());
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition border ${
      active ? 'bg-blue-500/15 border-blue-500/30 text-blue-200' : 'bg-overlay border-line text-faint hover:text-muted'
    }`;

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <p className="text-[11px] text-faint mb-2 flex items-center gap-1.5">
        <Sparkles size={12} /> Set up GTM, GA4 &amp; Meta — then add GTM to your site.
      </p>

      {!status.connected ? (
        <button type="button" onClick={connect}
          className="px-3 py-1.5 rounded-lg bg-overlay border border-line-strong text-ink text-xs font-medium hover:bg-overlay-strong transition flex items-center gap-1.5">
          <GitBranch size={12} /> Connect GitHub
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-emerald-300 flex items-center gap-1">
              <Check size={12} /> GitHub connected{status.login ? ` (@${status.login})` : ''}
            </span>
            <button type="button" onClick={disconnect} disabled={busy}
              className="ml-auto text-[11px] text-faint hover:text-muted underline disabled:opacity-50">Disconnect</button>
          </div>

          {/* ── STEP 1: create in GTM (GA4 + Meta optional) ── */}
          <div className="rounded-lg border border-line bg-overlay/40 p-2.5 space-y-2">
            <p className="text-[11px] text-ink font-medium">1. Create in GTM (no publish)</p>
            <p className="text-[11px] text-faint">What to set up — GTM container is always created; add GA4 and/or Meta to include their tags:</p>
            <div className="flex flex-wrap gap-1.5">
              <span className={chip(true)}><Check size={11} /> GTM container</span>
              <button type="button" onClick={() => setWantGa4((v) => !v)} className={chip(wantGa4)}>
                {wantGa4 && <Check size={11} />} GA4 property
              </button>
              <button type="button" onClick={() => setWantMeta((v) => !v)} className={chip(wantMeta)}>
                {wantMeta && <Check size={11} />} Meta Pixel
              </button>
            </div>

            <input value={containerName} onChange={(e) => setContainerName(e.target.value)} placeholder="New container name — optional"
              className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-blue-500/40" />
            {wantMeta && (
              <input value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} placeholder="Meta Pixel ID (numeric)"
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-blue-500/40" />
            )}
            {wantGa4 && ga4Accounts.length > 0 && (
              <select value={ga4AccountId} onChange={(e) => setGa4AccountId(e.target.value)}
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-blue-500/40">
                <option value="">Choose an Analytics account…</option>
                {ga4Accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
              </select>
            )}
            {gtmAccounts.length > 0 && (
              <select value={gtmAccountId} onChange={(e) => setGtmAccountId(e.target.value)}
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-blue-500/40">
                <option value="">Choose a Tag Manager account…</option>
                {gtmAccounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
              </select>
            )}

            {gWrite && !gWrite.canWrite ? (
              <div>
                <p className="text-[11px] text-faint mb-1.5">Creating in GTM/GA4 needs a one-time write consent.</p>
                <button type="button" onClick={connectWrite}
                  className="px-3 py-1.5 rounded-lg bg-overlay border border-line-strong text-ink text-xs font-medium hover:bg-overlay-strong transition flex items-center gap-1.5">
                  <ShieldCheck size={12} /> Connect Google for write
                </button>
              </div>
            ) : (
              <button type="button" onClick={createInGtm} disabled={creating || !metaOk}
                className="w-full py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-medium hover:bg-emerald-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Create in GTM{wantGa4 ? ' + GA4' : ''}{wantMeta ? ' + Meta' : ''} (no publish)
              </button>
            )}

            {createError && <p className="text-[11px] text-amber-300">{createError}</p>}
            {createResult && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-200 space-y-0.5">
                <p>Created container <code className="font-mono text-emerald-100">{createResult.gtmContainerId}</code> (unpublished).</p>
                {createResult.measurementId && <p>GA4 Measurement ID: <code className="font-mono text-emerald-100">{createResult.measurementId}</code></p>}
                {createResult.metaCreated && <p>Meta Pixel tags added.</p>}
                <p className="text-emerald-300/80">Filled in below — now add it to your site. Review &amp; publish in Tag Manager when ready.</p>
              </div>
            )}
          </div>

          {/* ── STEP 2: add the GTM snippet to the site via a PR ── */}
          <div className="rounded-lg border border-line bg-overlay/40 p-2.5 space-y-2">
            <p className="text-[11px] text-ink font-medium">2. Add GTM to your site (opens a PR)</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={selected} onChange={(e) => setSelected(e.target.value)}
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-blue-500/40">
                <option value="">{repos.length ? 'Choose a repository…' : 'Loading repositories…'}</option>
                {repos.map((r) => <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? ' (private)' : ''}</option>)}
              </select>
              <input value={containerId} onChange={(e) => setTyped(e.target.value)} placeholder="GTM-XXXXXXX"
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-blue-500/40" />
            </div>
            <button type="button" onClick={inject} disabled={busy || !selected || !validGtm}
              className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs font-medium hover:bg-blue-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
              Add GTM to my site (opens a PR)
            </button>
            <p className="text-[10px] text-faint">Opens a pull request for you to review &amp; merge. Never pushes to your default branch, never merges for you.</p>

            {result?.status === 'pr_opened' && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-200">
                Pull request opened against <code className="text-emerald-100">{result.base}</code> for <code className="text-emerald-100">{result.filePath}</code>.{' '}
                <a href={result.prUrl} target="_blank" rel="noreferrer" className="underline text-emerald-100">Review PR #{result.prNumber} →</a>
              </div>
            )}
            {result?.status === 'already_installed' && (
              <div className="rounded-lg bg-overlay border border-line p-2.5 text-[11px] text-muted">{result.message}</div>
            )}
            {(result?.status === 'manual' || result?.status === 'error') && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-200 space-y-2">
                <p>{result.status === 'manual' ? result.message : `Couldn't open a PR: ${result.error}`}</p>
                {result.pasteSnippet && (
                  <>
                    <pre className="whitespace-pre-wrap break-all bg-black/30 rounded p-2 text-[10px] text-amber-100 max-h-48 overflow-y-auto">{result.pasteSnippet}</pre>
                    <button type="button" onClick={() => copyPaste(result.pasteSnippet!)} className="text-[11px] text-amber-100 underline flex items-center gap-1">
                      <ClipboardCopy size={11} /> {copied ? 'Copied' : 'Copy snippet'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
