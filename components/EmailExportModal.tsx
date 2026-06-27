'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Loader2, CheckCircle2, FileSpreadsheet } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { isOpen: boolean; onClose: () => void; plan: any; score: any; scrapeData?: any; }

export default function EmailExportModal({ isOpen, onClose, plan, score, scrapeData }: Props) {
  const [step, setStep] = useState<'form' | 'sending' | 'success' | 'error'>('form');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail) { setError('Please enter a valid email'); return; }
    setStep('sending'); setError('');
    try {
      const res = await fetch('/api/send-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, companyName, email, plan, score, scrapeData }) });
      const data = await res.json();
      if (data.success) { setStep('success'); setTimeout(() => { onClose(); }, 2500); }
      else { setError(data.error || 'Failed to send'); setStep('error'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send'); setStep('error'); }
  };

  const reset = () => { setStep('form'); setName(''); setCompanyName(''); setEmail(''); setError(''); };
  const inputCls = "w-full px-4 py-3 bg-ds-card border border-ds-line rounded-xl text-ds-ink placeholder-slate-500 outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-md bg-ds-card border border-ds-line rounded-2xl p-8 shadow-2xl shadow-blue-500/5">
            <button onClick={onClose} className="absolute top-4 right-4 text-ds-muted hover:text-ds-ink transition"><X size={18} /></button>

            {step === 'form' && (<>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center"><Mail className="w-5 h-5 text-blue-400" /></div>
                <div><h3 className="text-ds-ink font-bold text-lg">Email me the plan</h3><p className="text-ds-muted text-xs">Excel workbook with your full measurement plan</p></div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-ds-secondary mb-1.5">Name</label><input type="text" required value={name} autoFocus onChange={e => setName(e.target.value)} placeholder="John Doe" className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-ds-secondary mb-1.5">Company Name</label><input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-ds-secondary mb-1.5">Email address</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" className={inputCls} /></div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" disabled={!isValidEmail || !name.trim() || !companyName.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-ds-accent-ink font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/25 transition flex items-center justify-center gap-2">
                  <Mail size={16} /> Send
                </button>
              </form>
              <div className="mt-5 flex items-center gap-2 text-xs text-ds-muted"><FileSpreadsheet size={12} /><span>Excel workbook · multiple sheets · ready to implement</span></div>
            </>)}

            {step === 'sending' && (<div className="py-10 text-center"><Loader2 className="mx-auto text-blue-400 animate-spin mb-4" size={36} /><h3 className="text-ds-ink font-bold text-xl mb-1">Sending your plan</h3><p className="text-ds-muted text-sm">Delivering to {email}</p></div>)}

            {step === 'success' && (<motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="py-10 text-center"><div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4"><CheckCircle2 className="text-emerald-400" size={32} /></div><h3 className="text-ds-ink font-bold text-xl mb-1">Plan sent!</h3><p className="text-ds-muted text-sm mb-2">Check {email}</p><p className="text-xs text-ds-muted">You can close this window</p></motion.div>)}

            {step === 'error' && (<div className="py-10 text-center"><p className="text-red-400 text-sm mb-4">{error}</p><button onClick={reset} className="px-5 py-2 rounded-xl bg-ds-card border border-ds-line text-ds-ink hover:bg-ds-panel transition">Try again</button></div>)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
