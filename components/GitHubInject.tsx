'use client';

// Connect GitHub → open a PR that adds the GTM container snippet to the site's
// <head>. Additive, self-contained: mounts inside the readiness/connect area and
// mirrors the "Connect Google" pattern (popup OAuth + postMessage). It never pushes
// to the default branch and never auto-merges — the server opens a PR for review.

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, GitPullRequest, Check, Loader2, ClipboardCopy } from 'lucide-react';

interface GhStatus {
  configured: boolean;
  connected: boolean;
  login?: string;
}
interface RepoSummary {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
}
type InjectResult =
  | { status: 'pr_opened'; filePath: string; base: string; prUrl: string; prNumber: number }
  | { status: 'already_installed'; filePath: string; message: string }
  | { status: 'manual'; message: string; pasteSnippet: string }
  | { status: 'error'; error: string; pasteSnippet?: string };

export default function GitHubInject({ defaultContainerId = '' }: { defaultContainerId?: string }) {
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [selected, setSelected] = useState('');
  // The user's typed value, falling back to the parent's prefill — derived rather
  // than synced through an effect (you-might-not-need-an-effect).
  const [typed, setTyped] = useState('');
  const containerId = typed || defaultContainerId;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InjectResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Reusable refresh for event-handler contexts (popup callback, disconnect).
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/github/status');
      if (res.ok) setStatus(await res.json());
    } catch {
      /* leave hidden */
    }
  }, []);

  // Initial status — async IIFE so setState happens after the await, not
  // synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/status');
        if (!cancelled && res.ok) setStatus(await res.json());
      } catch {
        /* leave hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When connected, load the repo list for the picker.
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/repos');
        if (!cancelled && res.ok) {
          const d = await res.json();
          setRepos(Array.isArray(d.repos) ? d.repos : []);
        }
      } catch {
        /* picker stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.connected]);

  // The OAuth popup posts back here when it finishes.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.source !== 'github-oauth') return;
      if (e.data.status === 'connected') fetchStatus();
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [fetchStatus]);

  const connect = () => window.open('/api/github/start', 'github_oauth', 'width=620,height=720');
  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch('/api/github/disconnect', { method: 'POST' });
      setRepos([]);
      setSelected('');
      setResult(null);
      await fetchStatus();
    } finally {
      setBusy(false);
    }
  };

  const inject = async () => {
    const repo = repos.find((r) => r.fullName === selected);
    if (!repo) return;
    setBusy(true);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch('/api/github/inject-gtm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      /* clipboard blocked — the snippet is still shown for manual copy */
    }
  };

  // Hidden entirely until the server says the feature is configured.
  if (!status || !status.configured) return null;

  const validGtm = /^GTM-[A-Z0-9]+$/i.test(containerId.trim());

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <p className="text-[11px] text-faint mb-2 flex items-center gap-1.5">
        <GitBranch size={12} /> Add the GTM snippet to your site&apos;s code via a pull request.
      </p>

      {!status.connected ? (
        <button
          type="button"
          onClick={connect}
          className="px-3 py-1.5 rounded-lg bg-overlay border border-line-strong text-ink text-xs font-medium hover:bg-overlay-strong transition flex items-center gap-1.5"
        >
          <GitBranch size={12} /> Connect GitHub
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-emerald-300 flex items-center gap-1">
              <Check size={12} /> GitHub connected{status.login ? ` (@${status.login})` : ''}
            </span>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="ml-auto text-[11px] text-faint hover:text-muted underline disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-blue-500/40"
            >
              <option value="">{repos.length ? 'Choose a repository…' : 'Loading repositories…'}</option>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName}
                  {r.private ? ' (private)' : ''}
                </option>
              ))}
            </select>
            <input
              value={containerId}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="GTM-XXXXXXX"
              className="w-full bg-overlay border border-line rounded-lg px-2.5 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-blue-500/40"
            />
          </div>

          <button
            type="button"
            onClick={inject}
            disabled={busy || !selected || !validGtm}
            className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs font-medium hover:bg-blue-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
            Add GTM to my site (opens a PR)
          </button>
          <p className="text-[10px] text-faint">
            Opens a pull request for you to review &amp; merge. It never pushes to your default branch and never merges
            for you.
          </p>

          {result?.status === 'pr_opened' && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-200">
              Pull request opened against <code className="text-emerald-100">{result.base}</code> for{' '}
              <code className="text-emerald-100">{result.filePath}</code>.{' '}
              <a href={result.prUrl} target="_blank" rel="noreferrer" className="underline text-emerald-100">
                Review PR #{result.prNumber} →
              </a>
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
                  <pre className="whitespace-pre-wrap break-all bg-black/30 rounded p-2 text-[10px] text-amber-100 max-h-48 overflow-y-auto">
                    {result.pasteSnippet}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyPaste(result.pasteSnippet!)}
                    className="text-[11px] text-amber-100 underline flex items-center gap-1"
                  >
                    <ClipboardCopy size={11} /> {copied ? 'Copied' : 'Copy snippet'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
