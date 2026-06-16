'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Mail, Sparkles, FileSearch, ArrowRight, ArrowLeft, Upload, X, FileSpreadsheet } from 'lucide-react';

interface Props {
  onSubmitNew: (data: { url: string; email: string }) => void;
  onSubmitExisting: (data: { url: string; email: string; planFile: File | null }) => void;
}

type View = 'choose' | 'new' | 'existing';

export default function HeroScreen({ onSubmitNew, onSubmitExisting }: Props) {
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
      <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-hidden relative">

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 80, damping: 15 }}
          className="text-center mb-5 relative z-10">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight">
            <span className="bg-clip-text text-transparent" style={{
              backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 30%, #38bdf8 60%, #818cf8 80%, #60a5fa 100%)',
              backgroundSize: '200% auto',
              animation: 'gradient-x 5s ease infinite',
            }}>
              Web Analytics
            </span>
            <br />
            <span className="text-white/90">Measurement Plan</span>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="text-base text-faint text-center max-w-2xl mb-10 font-medium relative z-10">
          Hand us your website and email — we&apos;ll hand back a complete measurement plan, ready to implement.
        </motion.p>

        {/* Two choice cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 120 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl relative z-10">

          <button onClick={() => setView('new')}
            className="group text-left p-6 bg-overlay backdrop-blur-2xl border border-line rounded-xl hover:border-blue-400/40 hover:bg-overlay-strong transition-all duration-200">
            <div className="p-2.5 rounded-lg bg-blue-500/15 inline-flex mb-4">
              <Sparkles className="text-blue-400" size={20} />
            </div>
            <h3 className="text-xl font-bold text-ink mb-1 leading-tight">New website</h3>
            <p className="text-sm text-faint leading-relaxed mb-4">
              No measurement plan yet. We&apos;ll build one from scratch — objectives, KPIs, events, and a roadmap.
            </p>
            <span className="text-sm text-blue-400 font-medium inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
              Build my plan <ArrowRight size={14} />
            </span>
          </button>

          <button onClick={() => setView('existing')}
            className="group text-left p-6 bg-overlay backdrop-blur-2xl border border-line rounded-xl hover:border-orange-400/40 hover:bg-overlay-strong transition-all duration-200">
            <div className="p-2.5 rounded-lg bg-orange-500/15 inline-flex mb-4">
              <FileSearch className="text-orange-400" size={20} />
            </div>
            <h3 className="text-xl font-bold text-ink mb-1 leading-tight">Existing website</h3>
            <p className="text-sm text-faint leading-relaxed mb-4">
              Already have a plan? Drop your Excel and we&apos;ll suggest which events to add, fix, or remove.
            </p>
            <span className="text-sm text-orange-400 font-medium inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
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
    <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-hidden relative">

      <button onClick={() => { setView('choose'); setUrl(''); setEmail(''); setPlanFile(null); setError(''); }}
        className="absolute top-6 left-6 flex items-center gap-2 text-faint hover:text-ink transition text-sm z-20">
        <ArrowLeft size={14} /> Back
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120 }}
        className="text-center mb-6 relative z-10">
        <p className={`text-[10px] uppercase tracking-[0.2em] mb-3 font-medium ${isNew ? 'text-blue-400' : 'text-orange-400'}`}>
          {isNew ? 'New Website' : 'Existing Website'}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">
          {isNew ? "Let's build your" : "Let's audit your"}
          <br />
          <span className="text-muted">{isNew ? 'measurement plan' : 'current tracking'}</span>
        </h1>
      </motion.div>

      <motion.form initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={handleSubmit} className="w-full max-w-md space-y-3 relative z-10">

        {/* URL */}
        <div className="flex items-center bg-overlay backdrop-blur-2xl border border-line rounded-xl overflow-hidden focus-within:border-blue-400/40 transition-all">
          <div className="flex items-center pl-4 pr-2">
            <Globe className="w-4 h-4 text-faint" />
          </div>
          <input
            type="text" required value={url} autoFocus
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-transparent py-4 px-2 text-ink placeholder-slate-500 outline-none text-sm"
          />
        </div>

        {/* Email */}
        <div className="flex items-center bg-overlay backdrop-blur-2xl border border-line rounded-xl overflow-hidden focus-within:border-blue-400/40 transition-all">
          <div className="flex items-center pl-4 pr-2">
            <Mail className="w-4 h-4 text-faint" />
          </div>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="flex-1 bg-transparent py-4 px-2 text-ink placeholder-slate-500 outline-none text-sm"
          />
        </div>

        {/* File upload — only for Existing path */}
        {!isNew && (
          <div>
            {!planFile ? (
              <label className="flex flex-col items-center justify-center gap-2 py-5 bg-overlay border-2 border-dashed border-line-strong rounded-xl cursor-pointer hover:border-orange-400/30 hover:bg-overlay transition-all">
                <Upload className="text-faint" size={20} />
                <div className="text-center">
                  <div className="text-sm text-ink font-medium">Drop your current plan</div>
                  <div className="text-xs text-faint">Excel file (.xlsx) — optional, max 5MB</div>
                </div>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3 bg-orange-500/10 border border-orange-400/20 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet className="text-orange-400 flex-shrink-0" size={18} />
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{planFile.name}</div>
                    <div className="text-xs text-faint">{(planFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                </div>
                <button type="button" onClick={() => setPlanFile(null)} className="text-faint hover:text-ink p-1">
                  <X size={16} />
                </button>
              </div>
            )}
            {!planFile && (
              <p className="text-xs text-faint mt-2 text-center">
                No file? We&apos;ll still audit your live site and recommend improvements.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Submit */}
        <motion.button type="submit" disabled={!canSubmit}
          whileHover={canSubmit ? { scale: 1.02 } : {}} whileTap={canSubmit ? { scale: 0.98 } : {}}
          className={`w-full py-4 mt-1 rounded-xl text-onaccent font-semibold flex items-center justify-center gap-2 disabled:opacity-25 disabled:cursor-not-allowed transition-all ${
            isNew
              ? 'bg-gradient-to-r from-blue-500 to-cyan-400 hover:shadow-[0_0_30px_rgba(96,165,250,0.3)]'
              : 'bg-gradient-to-r from-orange-500 to-amber-400 hover:shadow-[0_0_30px_rgba(249,115,22,0.3)]'
          }`}>
          {isNew ? (
            <><Sparkles className="w-4 h-4" /> Build & email my plan <ArrowRight className="w-4 h-4" /></>
          ) : (
            <><FileSearch className="w-4 h-4" /> Audit & email recommendations <ArrowRight className="w-4 h-4" /></>
          )}
        </motion.button>

        <p className="text-xs text-faint text-center pt-1">
          Delivered as an Excel workbook, ready to implement
        </p>
      </motion.form>
    </div>
  );
}
