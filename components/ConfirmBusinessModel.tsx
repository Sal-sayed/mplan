'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, HelpCircle, ShoppingCart, Cloud, Mail, Newspaper, Store } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

type BusinessModel = 'ecommerce' | 'saas' | 'lead_gen' | 'media_content' | 'marketplace';

const MODELS: { key: BusinessModel; label: string; blurb: string; Icon: any }[] = [
  { key: 'ecommerce', label: 'E-commerce', blurb: 'Sells products online (cart, checkout, purchase).', Icon: ShoppingCart },
  { key: 'saas', label: 'SaaS', blurb: 'Software with sign-ups, trials, subscriptions.', Icon: Cloud },
  { key: 'lead_gen', label: 'Lead generation', blurb: 'Captures enquiries, demos, quotes, contacts.', Icon: Mail },
  { key: 'media_content', label: 'Media / Content', blurb: 'Articles, blogs, newsletters, subscriptions.', Icon: Newspaper },
  { key: 'marketplace', label: 'Marketplace', blurb: 'Connects buyers and sellers via listings.', Icon: Store },
];

interface Props {
  classification: any;
  onConfirm: (model: BusinessModel) => void;
  onCancel: () => void;
}

export default function ConfirmBusinessModel({ classification, onConfirm, onCancel }: Props) {
  const guess: BusinessModel = (classification?.businessModel as BusinessModel) || 'lead_gen';
  const [selected, setSelected] = useState<BusinessModel>(guess);
  const confidencePct = Math.round((classification?.confidence ?? 0) * 100);

  return (
    <div className="h-full w-full flex items-center justify-center p-6 overflow-y-auto bg-[#0b1120] relative">
      <button onClick={onCancel}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-white transition text-sm z-20">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <HelpCircle className="text-amber-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Which best describes this site?</h1>
          <p className="text-slate-400 text-sm">
            We weren&apos;t confident enough to guess automatically
            {confidencePct > 0 && <> (best guess: <span className="text-white font-medium">{MODELS.find(m => m.key === guess)?.label}</span>, {confidencePct}%)</>}.
            Pick the closest match so we can tailor the plan.
          </p>
        </motion.div>

        <div className="space-y-2.5 mb-5">
          {MODELS.map((m) => {
            const active = selected === m.key;
            const isGuess = m.key === guess;
            return (
              <button key={m.key} onClick={() => setSelected(m.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  active
                    ? 'bg-blue-500/15 border-blue-500/50 shadow-lg shadow-blue-500/10'
                    : 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.2]'
                }`}>
                <div className={`p-2 rounded-lg shrink-0 ${active ? 'bg-blue-500/20' : 'bg-white/[0.05]'}`}>
                  <m.Icon className={active ? 'text-blue-300' : 'text-slate-400'} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{m.label}</span>
                    {isGuess && <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded">Best guess</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{m.blurb}</div>
                </div>
                <div className={`w-4 h-4 rounded-full border shrink-0 ${active ? 'border-blue-400 bg-blue-400' : 'border-slate-600'}`} />
              </button>
            );
          })}
        </div>

        <button onClick={() => onConfirm(selected)}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
          Generate the plan <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
