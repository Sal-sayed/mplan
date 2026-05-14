'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, FileText, FileSpreadsheet, FileJson, Check } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DirectDownloadButtons({ plan, score, scrapeData }: { plan: any; score: any; scrapeData?: any }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const download = async (format: 'pdf' | 'excel' | 'json') => {
    setLoading(format); setDone(null);
    try {
      const res = await fetch('/api/download-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, plan, score, scrapeData }) });
      if (!res.ok) throw new Error();
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `measurement-plan.${format === 'excel' ? 'xlsx' : format}`; a.click(); URL.revokeObjectURL(url);
      setDone(format); setTimeout(() => setDone(null), 2000);
    } catch { /* silent */ } finally { setLoading(null); }
  };

  const buttons = [
    { format: 'pdf' as const, icon: FileText, label: 'PDF', color: 'from-red-500/20 to-red-600/30 border-red-400/30 hover:border-red-400' },
    { format: 'excel' as const, icon: FileSpreadsheet, label: 'Excel', color: 'from-emerald-500/20 to-green-600/30 border-emerald-400/30 hover:border-emerald-400' },
    { format: 'json' as const, icon: FileJson, label: 'JSON', color: 'from-blue-500/20 to-cyan-600/30 border-blue-400/30 hover:border-blue-400' },
  ];

  return (
    <div className="flex gap-2">
      {buttons.map(b => (
        <motion.button key={b.format} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => download(b.format)} disabled={loading !== null}
          className={`px-3 py-2 rounded-xl bg-gradient-to-br ${b.color} border text-white text-sm font-medium flex items-center gap-1.5 transition-all disabled:opacity-50`}>
          {loading === b.format ? <Loader2 size={14} className="animate-spin" /> : done === b.format ? <Check size={14} className="text-emerald-400" /> : <b.icon size={14} />}
          {b.label}
        </motion.button>
      ))}
    </div>
  );
}
