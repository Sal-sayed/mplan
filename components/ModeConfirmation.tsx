'use client';

import { motion } from 'framer-motion';
import { Sparkles, Search, Check, ArrowRight } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  modeResult: any;
  onConfirm: (mode: 'new' | 'audit') => void;
}

export default function ModeConfirmation({ modeResult, onConfirm }: Props) {
  const { mode, detected, summary } = modeResult;
  const isAudit = mode === 'audit';

  return (
    <div className="h-full w-full flex items-center justify-center p-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-3 text-center">
          What we found
        </div>

        <h2 className="text-3xl font-bold text-white text-center mb-1 leading-tight">
          {isAudit ? 'Your site is already tracking' : 'Your site is ready for tracking'}
        </h2>
        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 text-center leading-tight">
          {isAudit ? "let's audit it" : "let's build the plan"}
        </h2>

        <div className="w-12 h-px bg-blue-500/40 mx-auto my-5" />

        <p className="text-slate-400 text-center text-sm mb-6 leading-relaxed">
          {summary}
        </p>

        {/* Detection details */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 mb-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-3">
            Detected
          </div>
          <div className="space-y-2 text-sm">
            <DetectionRow label="Google Analytics 4" value={detected.hasGA4} />
            <DetectionRow label="Google Tag Manager" value={detected.hasGTM} />
            <DetectionRow label="Custom events" value={detected.eventsFound.length > 0 ? `${detected.eventsFound.length} found` : false} />
            <DetectionRow label="Marketing pixels" value={detected.hasPixels.length > 0 ? detected.hasPixels.length : false} />
            <DetectionRow label="Consent mode" value={detected.hasConsentMode} />
          </div>
        </div>

        {/* Primary action — accept detected mode */}
        <button
          onClick={() => onConfirm(mode)}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold hover:shadow-lg hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2 mb-2.5"
        >
          {isAudit ? <Search size={14} /> : <Sparkles size={14} />}
          {isAudit ? 'Audit my current tracking' : 'Build a new measurement plan'}
          <ArrowRight size={14} />
        </button>

        {/* Override option */}
        <button
          onClick={() => onConfirm(mode === 'new' ? 'audit' : 'new')}
          className="w-full py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-400 text-sm hover:text-white hover:border-white/[0.15] transition"
        >
          {mode === 'new' ? 'Actually, audit existing setup instead' : 'Actually, build a fresh plan instead'}
        </button>
      </motion.div>
    </div>
  );
}

function DetectionRow({ label, value }: { label: string; value: any }) {
  const present = value && value !== false;
  return (
    <div className="flex items-center justify-between">
      <span className={present ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
      {present ? (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <Check size={12} />
          {typeof value === 'number' ? value : typeof value === 'string' ? value : 'Found'}
        </span>
      ) : (
        <span className="text-xs text-slate-600">Not detected</span>
      )}
    </div>
  );
}
