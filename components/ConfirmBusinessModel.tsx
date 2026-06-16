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
  onConfirmTemplate?: (model: BusinessModel) => void;
  onCancel: () => void;
}

export default function ConfirmBusinessModel({ classification, onConfirm, onConfirmTemplate, onCancel }: Props) {
  const guess: BusinessModel = (classification?.businessModel as BusinessModel) || 'lead_gen';
  const [selected, setSelected] = useState<BusinessModel>(guess);
  const confidencePct = Math.round((classification?.confidence ?? 0) * 100);

  return (
    <div className="h-full w-full flex items-center justify-center p-6 overflow-y-auto bg-app relative">
      <button onClick={onCancel}
        className="absolute top-6 left-6 flex items-center gap-2 text-faint hover:text-ink transition text-sm z-20">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <HelpCircle className="text-amber-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">Which best describes this site?</h1>
          <p className="text-faint text-sm">
            We weren&apos;t confident enough to guess automatically
            {confidencePct > 0 && <> (best guess: <span className="text-ink font-medium">{MODELS.find(m => m.key === guess)?.label}</span>, {confidencePct}%)</>}.
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
                    : 'bg-overlay border-line hover:border-line-strong'
                }`}>
                <div className={`p-2 rounded-lg shrink-0 ${active ? 'bg-blue-500/20' : 'bg-overlay'}`}>
                  <m.Icon className={active ? 'text-blue-300' : 'text-faint'} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{m.label}</span>
                    {isGuess && <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded">Best guess</span>}
                  </div>
                  <div className="text-xs text-faint truncate">{m.blurb}</div>
                </div>
                <div className={`w-4 h-4 rounded-full border shrink-0 ${active ? 'border-blue-400 bg-blue-400' : 'border-slate-600'}`} />
              </button>
            );
          })}
        </div>

        <button onClick={() => onConfirm(selected)}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-onaccent font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
          Generate the plan <ArrowRight size={15} />
        </button>

        {onConfirmTemplate && (
          <>
            <button onClick={() => onConfirmTemplate(selected)}
              className="w-full mt-2.5 py-3 rounded-xl bg-overlay border border-line text-muted text-sm font-medium hover:bg-overlay-strong transition">
              Generate instantly without AI (template)
            </button>
            <p className="text-center text-[11px] text-faint mt-2">
              A standards-based GA4/GTM baseline — instant, and works even if AI is unavailable.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
