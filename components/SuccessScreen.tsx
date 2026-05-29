'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Mail, FileSpreadsheet, ArrowRight, RotateCcw, Search, ArrowLeft } from 'lucide-react';
import ResultsScreen from './ResultsScreen';
import AuditResultsScreen from './AuditResultsScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  mode: 'new' | 'audit';
  plan: any;
  audit: any;
  score: any;
  scrapeData: any;
  email: string;
  emailDelivered: boolean;
  onReset: () => void;
}

export default function SuccessScreen({ mode, plan, audit, score, scrapeData, email, emailDelivered, onReset }: Props) {
  const [showPlan, setShowPlan] = useState(false);
  const [gameScore, setGameScore] = useState(0);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('bugGameHighScore');
      if (saved) setGameScore(parseInt(saved));
    } catch { /* SSR safe */ }
  }, []);

  if (showPlan && mode === 'new' && plan) {
    return <ResultsScreen plan={plan} score={score} scrapeData={scrapeData} onReset={onReset} />;
  }

  if (showPlan && mode === 'audit' && audit) {
    return <AuditResultsScreen audit={audit} score={score} scrapeData={scrapeData} onReset={onReset} onBack={() => setShowPlan(false)} />;
  }

  const isAudit = mode === 'audit';
  const websiteTitle = isAudit
    ? (audit?.websiteInfo?.title || audit?.websiteInfo?.url)
    : (plan?.websiteInfo?.title || plan?.websiteInfo?.url);

  return (
    <div className="h-full w-full flex items-center justify-center p-6 overflow-hidden bg-[#0b1120] relative">

      {/* Back button */}
      <button onClick={onReset}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-white transition text-sm z-20">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="w-full max-w-lg">

        {/* Check animation */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'backOut' }}
          className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6"
        >
          <CheckCircle2 className="text-emerald-400" size={36} />
        </motion.div>

        {/* Heading */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="text-center mb-6">
          {isAudit ? (
            <>
              <h1 className="text-3xl font-bold text-white mb-2">Your audit is on its way</h1>
              <p className="text-slate-400 text-sm">
                Sent to <span className="text-white font-medium">{email}</span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-white mb-2">Your plan is on its way</h1>
              <p className="text-slate-400 text-sm">
                Sent to <span className="text-white font-medium">{email}</span>
              </p>
            </>
          )}
          <p className="text-slate-500 text-xs mt-1">
            Check your inbox in the next minute (and spam, just in case)
          </p>
        </motion.div>

        {/* Email warning if failed */}
        {!emailDelivered && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 text-xs text-yellow-300 text-center">
            There was an issue sending the email. You can still view and download the plan below.
          </motion.div>
        )}

        {/* Plan summary card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${isAudit ? 'bg-orange-500/15' : 'bg-blue-500/15'}`}>
              {isAudit ? <Search className="text-orange-400" size={16} /> : <FileSpreadsheet className="text-blue-400" size={16} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{isAudit ? 'Tracking Audit' : 'Measurement Plan'}</div>
              <div className="text-xs text-slate-500 truncate">{websiteTitle}</div>
            </div>
          </div>

          {isAudit ? (
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-white/[0.06]">
              {[
                { label: 'To add', value: audit?.eventsToAdd?.length || 0 },
                { label: 'To modify', value: audit?.eventsToModify?.length || 0, color: 'text-yellow-400' },
                { label: 'Quick wins', value: audit?.quickWins?.length || 0, color: 'text-emerald-400' },
                { label: 'Score', value: score?.total || '\u2014', color: score?.total >= 70 ? 'text-emerald-400' : score?.total >= 50 ? 'text-yellow-400' : score?.total ? 'text-red-400' : 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-xl font-bold ${(s as any).color || 'text-white'}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-white/[0.06]">
              {[
                { label: 'Objectives', value: plan?.businessObjectives?.length || 0 },
                { label: 'KPIs', value: plan?.kpis?.length || 0 },
                { label: 'Events', value: plan?.events?.length || 0 },
                { label: 'Score', value: score?.total || '\u2014', color: score?.total >= 70 ? 'text-emerald-400' : score?.total >= 50 ? 'text-yellow-400' : score?.total ? 'text-red-400' : 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-xl font-bold ${(s as any).color || 'text-white'}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="space-y-2.5">
          {mode === 'new' && plan && (
            <button onClick={() => setShowPlan(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
              View the plan on-screen <ArrowRight size={15} />
            </button>
          )}
          {mode === 'audit' && audit && (
            <button onClick={() => setShowPlan(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-orange-500/20 transition-all">
              View audit findings <ArrowRight size={15} />
            </button>
          )}
          <button onClick={onReset}
            className="w-full py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-400 text-sm hover:text-white hover:border-white/[0.15] transition flex items-center justify-center gap-2">
            <RotateCcw size={13} /> Analyze another website
          </button>
        </motion.div>

        {/* Bug game score badge */}
        {gameScore > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-2">
              <span className="text-lg">{'\ud83d\udc1b'}</span>
              <span className="text-sm text-yellow-300 font-medium">
                You squashed bugs for {gameScore} points while we worked!
              </span>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Mail size={11} />
            <span>{isAudit ? 'Excel workbook \u00B7 8 sheets \u00B7 audit + roadmap' : 'Excel workbook \u00B7 8 sheets \u00B7 ready to implement'}</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
