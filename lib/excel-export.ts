/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';
import { buildPlanWorkbook } from './plan-workbook';

// The new-plan workbook is the impressive, fully-coded "Sirah Digital" deliverable
// (lib/plan-workbook.ts); generatePlanExcel/generateExcel delegate to it. The audit
// path keeps using createDashboardSheet below (unchanged).

export async function generateExcel(plan: any, score: any): Promise<ArrayBuffer> {
  const buf = await generatePlanExcel(plan, score);
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return ab;
}

// `_mode` is kept for call-site compatibility; the builder renders the same rich
// workbook regardless of mode.
export async function generatePlanExcel(plan: any, score: any, _mode: 'new' | 'existing' = 'new'): Promise<Buffer> {
  void _mode;
  return buildPlanWorkbook(plan, score);
}

// ═══════════════════════════════════════════
// DASHBOARD SHEET — for New Website + Existing (no upload) paths
// ═══════════════════════════════════════════

export function createDashboardSheet(wb: ExcelJS.Workbook, data: any, mode: 'new' | 'audit') {
  const sheet = wb.addWorksheet('Dashboard', {
    properties: { tabColor: { argb: 'FF1E40AF' } },
    views: [{ showGridLines: false }],
  });

  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 22;
  sheet.getColumn(6).width = 4;

  const websiteInfo = data?.websiteInfo || {};
  const scoreRaw = data?.score;
  const scoreValue = typeof scoreRaw === 'number' ? scoreRaw : (scoreRaw?.total || scoreRaw?.overall || 0);

  const THIN_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFE5E7EB' } };
  const BLUE_BORDER: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF1E40AF' } };

  // ─── ROW 2: Label ───
  sheet.mergeCells('B2:E2');
  const labelCell = sheet.getCell('B2');
  labelCell.value = mode === 'new' ? 'MEASUREMENT PLAN' : 'TRACKING AUDIT';
  labelCell.font = { size: 10, color: { argb: 'FF6B7280' }, bold: true };
  labelCell.alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 22;

  // ─── ROW 3: Title ───
  sheet.mergeCells('B3:E3');
  const titleCell = sheet.getCell('B3');
  titleCell.value = websiteInfo.title || websiteInfo.url || (mode === 'new' ? 'Website Measurement Plan' : 'Website Tracking Audit');
  titleCell.font = { size: 22, color: { argb: 'FF0F1E3D' }, bold: true };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(3).height = 34;

  // ─── ROW 4: Subtitle ───
  sheet.mergeCells('B4:E4');
  const subCell = sheet.getCell('B4');
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const actionWord = mode === 'new' ? 'Generated' : 'Audited';
  subCell.value = `${websiteInfo.industry || 'Industry analysis'} \u00B7 ${actionWord} ${today}`;
  subCell.font = { size: 10, color: { argb: 'FF6B7280' }, italic: true };
  sheet.getRow(4).height = 18;

  // ─── ROW 5: Divider ───
  sheet.mergeCells('B5:E5');
  sheet.getCell('B5').border = { bottom: BLUE_BORDER };
  sheet.getRow(5).height = 8;

  // ─── ROWS 7-10: Big Score ───
  sheet.mergeCells('B7:C10');
  const scoreCell = sheet.getCell('B7');
  scoreCell.value = scoreValue;
  const scoreColor = scoreValue >= 80 ? 'FF10B981' : scoreValue >= 50 ? 'FFF59E0B' : 'FFEF4444';
  scoreCell.font = { size: 72, color: { argb: scoreColor }, bold: true };
  scoreCell.alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells('D7:E8');
  const scoreLbl = sheet.getCell('D7');
  scoreLbl.value = mode === 'new' ? 'READINESS\nSCORE / 100' : 'TRACKING\nSCORE / 100';
  scoreLbl.font = { size: 10, color: { argb: 'FF6B7280' }, bold: true };
  scoreLbl.alignment = { vertical: 'middle', wrapText: true };

  sheet.mergeCells('D9:E10');
  const scoreNote = sheet.getCell('D9');
  if (mode === 'new') {
    scoreNote.value = scoreValue >= 80 ? 'Strong foundation for measurement'
      : scoreValue >= 50 ? 'Good baseline \u2014 fill the gaps below'
      : 'Major opportunities to instrument';
  } else {
    scoreNote.value = scoreValue >= 80 ? 'Tracking is healthy \u2014 minor improvements only'
      : scoreValue >= 50 ? 'Significant gaps detected \u2014 see priorities'
      : 'Critical issues need immediate attention';
  }
  scoreNote.font = { size: 10, color: { argb: 'FF374151' }, italic: true };
  scoreNote.alignment = { vertical: 'middle', wrapText: true };

  sheet.getRow(7).height = 28; sheet.getRow(8).height = 24;
  sheet.getRow(9).height = 18; sheet.getRow(10).height = 18;
  sheet.getRow(11).height = 12;

  // ─── ROWS 12-13: 4 Metric Cards ───
  let metricDefs: { col: string; label: string; value: number; color: string; bg: string }[];

  if (mode === 'new') {
    const plan = data?.plan || {};
    metricDefs = [
      { col: 'B', label: 'EVENTS', value: (plan.events || []).length, color: 'FF1E40AF', bg: 'FFDBEAFE' },
      { col: 'C', label: 'KPIs', value: (plan.kpis || []).length, color: 'FF065F46', bg: 'FFD1FAE5' },
      { col: 'D', label: 'KEY EVENTS', value: (plan.events || []).filter((e: any) => e?.isKeyEvent).length, color: 'FF92400E', bg: 'FFFEF3C7' },
      { col: 'E', label: 'DATA LAYER', value: (plan.dataLayer || []).length, color: 'FF6D28D9', bg: 'FFEDE9FE' },
    ];
  } else {
    const audit = data?.audit || {};
    const allEvts = audit.currentlyFiringEvents || [];
    metricDefs = [
      { col: 'B', label: 'CONFIGURED', value: allEvts.filter((e: any) => (e.source || '').match(/Container|HTML|GTM Tag/)).length, color: 'FF1E40AF', bg: 'FFDBEAFE' },
      { col: 'C', label: 'FIRING NOW', value: allEvts.filter((e: any) => (e.source || '').match(/Network|dataLayer|Pixel|verified/)).length, color: 'FF065F46', bg: 'FFD1FAE5' },
      { col: 'D', label: 'TO ADD', value: (audit.eventsToAdd || []).length, color: 'FF92400E', bg: 'FFFEF3C7' },
      { col: 'E', label: 'CRITICAL', value: (audit.criticalIssues || []).length, color: 'FF991B1B', bg: 'FFFEE2E2' },
    ];
  }

  metricDefs.forEach(m => {
    const vCell = sheet.getCell(`${m.col}12`);
    vCell.value = m.value;
    vCell.font = { size: 28, color: { argb: m.color }, bold: true };
    vCell.alignment = { vertical: 'middle', horizontal: 'center' };
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m.bg } };
    vCell.border = { top: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

    const lCell = sheet.getCell(`${m.col}13`);
    lCell.value = m.label;
    lCell.font = { size: 9, color: { argb: m.color }, bold: true };
    lCell.alignment = { vertical: 'middle', horizontal: 'center' };
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m.bg } };
    lCell.border = { bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
  });

  sheet.getRow(12).height = 44; sheet.getRow(13).height = 22;
  sheet.getRow(15).height = 14;

  // ─── ROW 16: Priorities Header ───
  sheet.mergeCells('B16:E16');
  const prioHeader = sheet.getCell('B16');
  prioHeader.value = mode === 'new' ? 'TOP 3 IMPLEMENTATION PRIORITIES' : 'TOP 3 PRIORITIES';
  prioHeader.font = { size: 11, color: { argb: 'FF6B7280' }, bold: true };
  prioHeader.border = { bottom: THIN_BORDER };
  sheet.getRow(16).height = 24;

  // ─── ROWS 18+: Priority Items ───
  let priorities: string[] = [];
  if (mode === 'new') {
    const plan = data?.plan || {};
    const events = plan.events || [];
    const keyEvents = events.filter((e: any) => e?.isKeyEvent);
    const top = (keyEvents.length ? keyEvents : events).slice(0, 3);
    priorities = top.map((e: any) => `Implement ${e.name || e.eventName || 'event'}`);
  } else {
    const audit = data?.audit || {};
    if (audit.criticalIssues?.length) priorities = audit.criticalIssues.slice(0, 3);
    else if (audit.quickWins?.length) priorities = audit.quickWins.slice(0, 3).map((qw: any) => qw.action || String(qw));
    else if (audit.implementationRoadmap?.[0]?.tasks?.length) priorities = audit.implementationRoadmap[0].tasks.slice(0, 3);
  }
  while (priorities.length < 3) priorities.push('');

  priorities.forEach((priority: string, i: number) => {
    const row = 18 + i * 2;
    sheet.getCell(`B${row}`).value = `0${i + 1}`;
    sheet.getCell(`B${row}`).font = { size: 22, color: { argb: 'FF1E40AF' }, bold: true };
    sheet.getCell(`B${row}`).alignment = { vertical: 'top' };
    sheet.mergeCells(`C${row}:E${row}`);
    sheet.getCell(`C${row}`).value = priority;
    sheet.getCell(`C${row}`).font = { size: 11, color: { argb: 'FF1A1A1A' } };
    sheet.getCell(`C${row}`).alignment = { vertical: 'top', wrapText: true };
    sheet.getRow(row).height = 36;
    sheet.getRow(row + 1).height = 6;
  });

  // ─── Footer ───
  const footerRow = 18 + priorities.length * 2 + 2;
  sheet.mergeCells(`B${footerRow}:E${footerRow}`);
  sheet.getCell(`B${footerRow}`).value = 'See following sheets for detailed analysis \u2192';
  sheet.getCell(`B${footerRow}`).font = { size: 9, color: { argb: 'FF9CA3AF' }, italic: true };
  sheet.getCell(`B${footerRow}`).alignment = { vertical: 'middle', horizontal: 'right' };
  sheet.getRow(footerRow).height = 20;

  // Move Dashboard to first position
  const idx = wb.worksheets.indexOf(sheet);
  if (idx > 0) { wb.worksheets.splice(idx, 1); wb.worksheets.unshift(sheet); }
}
