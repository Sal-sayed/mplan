/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from 'jspdf';
import { sanitizePlan } from './sanitize-plan';

export async function generatePlanPDF(plan: any, score: any): Promise<Buffer> {
  plan = sanitizePlan(plan);
  const doc = new jsPDF();
  const margin = 15;
  let y = 20;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(124, 58, 237);
  doc.text('Web Analytics Measurement Plan', margin, y);
  y += 10;
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(plan.websiteInfo?.url || '', margin, y);
  y += 8;
  doc.text(`${plan.websiteInfo?.businessType || ''} | ${plan.websiteInfo?.industry || ''}`, margin, y);
  y += 8;

  // Health score
  if (score) {
    doc.text(`Health Score: ${score.total}/${score.maxTotal} (Grade: ${score.grade})`, margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(score.verdict || '', margin, y);
    y += 12;
  } else {
    y += 8;
  }

  const addSection = (title: string, items: unknown[]) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text(title, margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);

    items.forEach(item => {
      if (y > 275) { doc.addPage(); y = 20; }
      const text = typeof item === 'object' && item !== null
        ? JSON.stringify(item, null, 0).substring(0, 130)
        : String(item);
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, margin + 5, y);
      y += lines.length * 5 + 3;
    });
    y += 5;
  };

  if (plan.businessObjectives?.length) {
    addSection('Business Objectives', plan.businessObjectives.map((o: any) =>
      `[${o.priority}] ${o.objective} - ${o.description?.slice(0, 80) || ''}`));
  }
  if (plan.kpis?.length) {
    addSection('Key Performance Indicators', plan.kpis.map((k: any) =>
      `${k.name} | Target: ${k.target} | ${k.formula}`));
  }
  if (plan.events?.length) {
    addSection('GA4 Events', plan.events.map((e: any) =>
      `${e.eventName} [${e.priority}] - ${e.trigger?.slice(0, 80) || ''}`));
  }
  if (plan.customDimensions?.length) {
    addSection('Custom Dimensions', plan.customDimensions.map((d: any) =>
      `${d.name} (${d.scope}): ${d.description?.slice(0, 80) || ''}`));
  }
  if (plan.conversionGoals?.length) {
    addSection('Conversion Goals', plan.conversionGoals.map((c: any) =>
      `[${c.type}] ${c.name} - ${c.event} | ${c.businessImpact?.slice(0, 60) || ''}`));
  }
  if (plan.implementationPlan?.length) {
    addSection('Implementation Plan', plan.implementationPlan.map((p: any) =>
      `Phase ${p.phase}: ${p.phaseName} (${p.duration}) - ${(p.tasks || []).length} tasks`));
  }
  if (plan.insights) {
    const insightItems: string[] = [];
    if (plan.insights.quickWins?.length) insightItems.push(...plan.insights.quickWins.map((w: string) => `Quick Win: ${w}`));
    if (plan.insights.risks?.length) insightItems.push(...plan.insights.risks.map((r: string) => `Risk: ${r}`));
    if (insightItems.length) addSection('Insights', insightItems);
  }

  // Score breakdown
  if (score?.dimensions?.length) {
    addSection('Health Score Breakdown', score.dimensions.map((d: any) =>
      `${d.name}: ${d.score}/${d.maxScore} (${d.status}) - ${(d.findings || []).join(', ')}`));
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
