'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Mail, Sparkles, FileSearch, ArrowRight, ArrowLeft, Upload, X, FileSpreadsheet, LayoutDashboard } from 'lucide-react';

interface Props {
  onSubmitNew: (data: { url: string; email: string }) => void;
  onSubmitExisting: (data: { url: string; email: string; planFile: File | null }) => void;
  // Optional: the signed-in account (any signed-in user). Shows "Signed in as …"
  // with a Sign-out control, so it's always clear which account is active and
  // signing out is one click — the app session is separate from the browser's
  // Google login.
  account?: { email: string; onSignOut: () => void };
  // Optional: a signed-in returning user with a saved plan. When present, the
  // chooser adds a "Welcome back" card with two choices — open the recent plan's
  // dashboard, or generate an updated plan (saved site + account email, no
  // re-entry). The new/existing cards below still let them start a fresh site.
  // Absent → the normal new/existing chooser only.
  returning?: { siteUrl: string; email: string; onGenerateUpdated: () => void; onOpenRecent?: () => void };
}

type View = 'choose' | 'new' | 'existing';

// Friendly host for the saved URL (falls back to the raw value).
function hostOf(u: string): string {
  try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname; } catch { return u; }
}

export default function HeroScreen({ onSubmitNew, onSubmitExisting, account, returning }: Props) {
  const [view, setView] = useState<View>('choose');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const normalizeUrl = (v: string) => v.startsWith('http') ? v : `https://${v}`;
  const isValidUrl = (v: string) => { try { const u = new URL(normalizeUrl(v)); return !!u.hostname.includes('.'); } catch { return false; } };
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = url.length > 0 && isValidUrl(url) && isValidEmail;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB');
      return;
    }
    setError('');
    setPlanFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const normalizedUrl = normalizeUrl(url);
    if (view === 'new') onSubmitNew({ url: normalizedUrl, email });
    if (view === 'existing') onSubmitExisting({ url: normalizedUrl, email, planFile });
  };

  // ─── CHOOSE VIEW (two cards) ─────────────────
  if (view === 'choose') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-hidden relative bg-ds-page">

        {/* Active account + switch — always visible when signed in, so it's clear
            which account the app is using and switching is one click. */}
        {account && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 text-xs">
            <span className="hidden sm:inline text-ds-muted">Signed in as <span className="font-medium text-ds-secondary">{account.email}</span></span>
            <button onClick={account.onSignOut}
              className="rounded-lg border border-ds-line-strong bg-ds-card px-2.5 py-1.5 font-medium text-ds-ink transition hover:bg-ds-panel">
              Sign out
            </button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 80, damping: 15 }}
          className="text-center mb-5 relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ds-accent-soft px-3 py-1 text-xs font-medium text-ds-accent mb-5">
            <Sparkles size={13} /> Measurement planning, automated
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-ds-ink">
            Web Analytics
            <br />
            <span className="text-ds-accent">Measurement Plan</span>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="text-base text-ds-secondary text-center max-w-2xl mb-10 relative z-10">
          Hand us your website and email — we&apos;ll hand back a complete measurement plan, ready to implement.
        </motion.p>

        {/* Returning user — two choices for their saved site, no URL/email re-entry:
            open the recent plan's dashboard, or generate an updated plan. */}
        {returning && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, type: 'spring', stiffness: 120 }}
            className="w-full max-w-2xl mb-6 relative z-10">
            <div className="rounded-2xl border border-ds-accent/30 bg-ds-accent-soft p-5">
              <p className="text-sm font-semibold text-ds-ink">Welcome back</p>
              <p className="mt-0.5 text-xs text-ds-secondary">
                You already have a plan for <span className="font-medium text-ds-ink break-all">{hostOf(returning.siteUrl)}</span>. Open it to view &amp; set up, or generate an updated one — emailed to <span className="font-medium text-ds-ink break-all">{returning.email}</span>. No need to re-enter anything.
                {account && (
                  <> Not <span className="font-medium text-ds-ink break-all">{returning.email}</span>?{' '}
                    <button onClick={account.onSignOut} className="font-medium text-ds-accent underline underline-offset-2 hover:text-ds-accent-hover">Sign out</button>.
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {returning.onOpenRecent && (
                  <button onClick={returning.onOpenRecent}
                    className="inline-flex items-center gap-2 rounded-xl bg-ds-accent px-4 py-2.5 text-sm font-semibold text-ds-accent-ink shadow-sm transition hover:bg-ds-accent-hover">
                    <LayoutDashboard size={14} /> Open recent plan <ArrowRight size={14} />
                  </button>
                )}
                <button onClick={returning.onGenerateUpdated}
                  className="inline-flex items-center gap-2 rounded-xl border border-ds-line-strong bg-ds-card px-4 py-2.5 text-sm font-medium text-ds-ink transition hover:bg-ds-panel">
                  <Sparkles size={14} /> Generate updated plan
                </button>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-ds-muted">or start a new plan below</p>
          </motion.div>
        )}

        {/* Two choice cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 120 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl relative z-10">

          <button onClick={() => setView('new')}
            className="group text-left p-6 bg-ds-card border border-ds-line rounded-2xl shadow-sm hover:border-ds-accent/40 hover:shadow-md transition-all duration-200">
            <div className="p-2.5 rounded-lg bg-ds-accent-soft inline-flex mb-4">
              <Sparkles className="text-ds-accent" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-ds-ink mb-1 leading-tight">New website</h3>
            <p className="text-sm text-ds-secondary leading-relaxed mb-4">
              No measurement plan yet. We&apos;ll build one from scratch — objectives, KPIs, events, and a roadmap.
            </p>
            <span className="text-sm text-ds-accent font-medium inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
              Build my plan <ArrowRight size={14} />
            </span>
          </button>

          <button onClick={() => setView('existing')}
            className="group text-left p-6 bg-ds-card border border-ds-line rounded-2xl shadow-sm hover:border-ds-accent/40 hover:shadow-md transition-all duration-200">
            <div className="p-2.5 rounded-lg bg-ds-accent-soft inline-flex mb-4">
              <FileSearch className="text-ds-accent" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-ds-ink mb-1 leading-tight">Existing website</h3>
            <p className="text-sm text-ds-secondary leading-relaxed mb-4">
              Already have a plan? Drop your Excel and we&apos;ll suggest which events to add, fix, or remove.
            </p>
            <span className="text-sm text-ds-accent font-medium inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
              Audit my plan <ArrowRight size={14} />
            </span>
          </button>

        </motion.div>
      </div>
    );
  }

  // ─── FORM VIEW (either new or existing) ──────
  const isNew = view === 'new';

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-hidden relative bg-ds-page">

      <button onClick={() => { setView('choose'); setUrl(''); setEmail(''); setPlanFile(null); setError(''); }}
        className="absolute top-6 left-6 flex items-center gap-2 text-ds-secondary hover:text-ds-ink transition text-sm z-20">
        <ArrowLeft size={14} /> Back
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120 }}
        className="text-center mb-6 relative z-10">
        <p className="text-[10px] uppercase tracking-[0.2em] mb-3 font-medium text-ds-accent">
          {isNew ? 'New Website' : 'Existing Website'}
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-ds-ink leading-tight tracking-tight">
          {isNew ? "Let's build your" : "Let's audit your"}
          <br />
          <span className="text-ds-secondary">{isNew ? 'measurement plan' : 'current tracking'}</span>
        </h1>
      </motion.div>

      <motion.form initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={handleSubmit} className="w-full max-w-md space-y-3 relative z-10">

        {/* URL */}
        <div className="flex items-center bg-ds-card border border-ds-line rounded-xl overflow-hidden shadow-sm focus-within:border-ds-accent transition-all">
          <div className="flex items-center pl-4 pr-2">
            <Globe className="w-4 h-4 text-ds-muted" />
          </div>
          <input
            type="text" required value={url} autoFocus
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-transparent py-4 px-2 text-ds-ink placeholder-ds-muted outline-none text-sm"
          />
        </div>

        {/* Email */}
        <div className="flex items-center bg-ds-card border border-ds-line rounded-xl overflow-hidden shadow-sm focus-within:border-ds-accent transition-all">
          <div className="flex items-center pl-4 pr-2">
            <Mail className="w-4 h-4 text-ds-muted" />
          </div>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="flex-1 bg-transparent py-4 px-2 text-ds-ink placeholder-ds-muted outline-none text-sm"
          />
        </div>

        {/* File upload — only for Existing path */}
        {!isNew && (
          <div>
            {!planFile ? (
              <label className="flex flex-col items-center justify-center gap-2 py-5 bg-ds-card border-2 border-dashed border-ds-line-strong rounded-xl cursor-pointer hover:border-ds-accent/40 hover:bg-ds-accent-soft transition-all">
                <Upload className="text-ds-muted" size={20} />
                <div className="text-center">
                  <div className="text-sm text-ds-ink font-medium">Drop your current plan</div>
                  <div className="text-xs text-ds-muted">Excel file (.xlsx) — optional, max 5MB</div>
                </div>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3 bg-ds-accent-soft border border-ds-accent/20 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet className="text-ds-accent flex-shrink-0" size={18} />
                  <div className="min-w-0">
                    <div className="text-sm text-ds-ink font-medium truncate">{planFile.name}</div>
                    <div className="text-xs text-ds-muted">{(planFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                </div>
                <button type="button" onClick={() => setPlanFile(null)} className="text-ds-muted hover:text-ds-ink p-1">
                  <X size={16} />
                </button>
              </div>
            )}
            {!planFile && (
              <p className="text-xs text-ds-muted mt-2 text-center">
                No file? We&apos;ll still audit your live site and recommend improvements.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-ds-danger">{error}</p>}

        {/* Submit */}
        <motion.button type="submit" disabled={!canSubmit}
          whileHover={canSubmit ? { scale: 1.02 } : {}} whileTap={canSubmit ? { scale: 0.98 } : {}}
          className="w-full py-4 mt-1 rounded-xl bg-ds-accent text-ds-accent-ink font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-ds-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {isNew ? (
            <><Sparkles className="w-4 h-4" /> Build & email my plan <ArrowRight className="w-4 h-4" /></>
          ) : (
            <><FileSearch className="w-4 h-4" /> Audit & email recommendations <ArrowRight className="w-4 h-4" /></>
          )}
        </motion.button>

        <p className="text-xs text-ds-muted text-center pt-1">
          Delivered as an Excel workbook, ready to implement
        </p>
      </motion.form>
    </div>
  );
}
