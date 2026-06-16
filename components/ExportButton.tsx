'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileDown, FileJson, FileSpreadsheet, Check, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';

interface ExportButtonProps {
  plan: Record<string, unknown>;
  score?: Record<string, unknown>;
  type: 'pdf' | 'json' | 'excel';
}

export default function ExportButton({ plan, score, type }: ExportButtonProps) {
  const [exported, setExported] = useState(false);
  const [loading, setLoading] = useState(false);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF();
    const info = plan.websiteInfo as Record<string, string> | undefined;
    const margin = 15;
    let y = 20;

    // Title
    doc.setFontSize(20);
    doc.setTextColor(139, 92, 246);
    doc.text('Measurement Plan', margin, y);
    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(info?.url || '', margin, y);
    y += 15;

    const addSection = (title: string, items: unknown[]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text(title, margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);

      items.forEach((item) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        const text =
          typeof item === 'object' && item !== null
            ? JSON.stringify(item, null, 0).substring(0, 120)
            : String(item);
        const lines = doc.splitTextToSize(text, 180);
        doc.text(lines, margin + 5, y);
        y += lines.length * 5 + 3;
      });
      y += 5;
    };

    if (Array.isArray(plan.businessObjectives)) {
      addSection(
        'Business Objectives',
        (plan.businessObjectives as Array<{ objective?: string }>).map(
          (o) => o.objective || JSON.stringify(o)
        )
      );
    }
    if (Array.isArray(plan.kpis)) {
      addSection(
        'KPIs',
        (plan.kpis as Array<{ name?: string; target?: string }>).map(
          (k) => `${k.name || ''} - Target: ${k.target || ''}`
        )
      );
    }
    if (Array.isArray(plan.events)) {
      addSection(
        'Events',
        (plan.events as Array<{ eventName?: string; trigger?: string }>).map(
          (e) => `${e.eventName || ''}: ${e.trigger || ''}`
        )
      );
    }
    if (Array.isArray(plan.customDimensions)) {
      addSection(
        'Custom Dimensions',
        (
          plan.customDimensions as Array<{
            name?: string;
            scope?: string;
            description?: string;
          }>
        ).map((d) => `${d.name || ''} (${d.scope || ''}): ${d.description || ''}`)
      );
    }
    if (Array.isArray(plan.implementationPlan)) {
      addSection(
        'Implementation Plan',
        (
          plan.implementationPlan as Array<{
            phaseName?: string;
            duration?: string;
          }>
        ).map((p) => `${p.phaseName || ''} - ${p.duration || ''}`)
      );
    }

    doc.save('measurement-plan.pdf');
  }, [plan]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'measurement-plan.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  const exportExcel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, score }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate Excel file');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Measurement_Plan.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export error:', err);
    } finally {
      setLoading(false);
    }
  }, [plan]);

  const handleExport = async () => {
    if (type === 'pdf') exportPDF();
    else if (type === 'json') exportJSON();
    else if (type === 'excel') await exportExcel();
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const buttonStyles =
    type === 'excel'
      ? 'flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600/20 to-green-600/20 backdrop-blur-xl rounded-xl border border-emerald-500/30 text-sm text-emerald-300 hover:text-ink hover:border-emerald-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]'
      : 'flex items-center gap-2 px-4 py-2.5 bg-overlay backdrop-blur-xl rounded-xl border border-line text-sm text-muted hover:text-ink hover:border-purple-500/30 transition-all duration-300';

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleExport}
      disabled={loading}
      className={buttonStyles}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating...
        </>
      ) : exported ? (
        <>
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400">Downloaded!</span>
        </>
      ) : type === 'pdf' ? (
        <>
          <FileDown className="w-4 h-4" />
          Export PDF
        </>
      ) : type === 'excel' ? (
        <>
          <FileSpreadsheet className="w-4 h-4" />
          Export Excel
        </>
      ) : (
        <>
          <FileJson className="w-4 h-4" />
          Export JSON
        </>
      )}
    </motion.button>
  );
}
