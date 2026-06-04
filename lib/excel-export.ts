/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'measurement-plan-template.xlsx');

/** Write ONLY the value into a cell — never touch fill, font, border, or alignment */
function writeValue(sheet: ExcelJS.Worksheet, cellRef: string, value: any) {
  const cell = sheet.getCell(cellRef);
  cell.value = value;
}

/** Copy styling from a template data row to a new row below it */
function copyRowStyle(sheet: ExcelJS.Worksheet, sourceRow: number, targetRow: number, columnCount: number) {
  for (let col = 1; col <= columnCount; col++) {
    const src = sheet.getCell(sourceRow, col);
    const tgt = sheet.getCell(targetRow, col);
    if (src.style) tgt.style = JSON.parse(JSON.stringify(src.style));
  }
  const srcRow = sheet.getRow(sourceRow);
  const tgtRow = sheet.getRow(targetRow);
  if (srcRow.height) tgtRow.height = srcRow.height;
}

export async function generateExcel(plan: any, score: any): Promise<ArrayBuffer> {
  const buf = await generatePlanExcel(plan, score);
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return ab;
}

export async function generatePlanExcel(plan: any, score: any, mode: 'new' | 'existing' = 'new'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const fileBytes = fs.readFileSync(TEMPLATE_PATH);
  const ab = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);

  populateProjectOverview(wb, plan);
  populateObjectivesAndKPIs(wb, plan);
  populateMetricsAndDimensions(wb, plan);
  populateDataSources(wb, plan);
  populateTrackingPlan(wb, plan);
  populateReportingCadence(wb, plan);
  populateRACI(wb, plan);

  // Add Dashboard at position 1 for new website path
  createDashboardSheet(wb, { websiteInfo: plan.websiteInfo, score, plan }, 'new');

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── SHEET 2: PROJECT OVERVIEW (no new rows needed) ───
function populateProjectOverview(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('2. Project Overview');
  if (!sheet) return;
  const info = plan.websiteInfo || {};
  writeValue(sheet, 'B3', info.title || info.url || '');
  writeValue(sheet, 'B11', new Date().toLocaleDateString('en-US'));
  writeValue(sheet, 'A14', info.description || `Measurement plan for ${info.url || 'the website'}. Industry: ${info.industry || 'N/A'}. Business type: ${info.businessType || 'N/A'}.`);
}

// ─── SHEET 3: OBJECTIVES & KPIs (template data row = 5, 10 columns) ───
function populateObjectivesAndKPIs(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('3. Objectives & KPIs');
  if (!sheet) return;
  const TMPL_ROW = 5, COLS = 10;
  const objectives = plan.businessObjectives || [];
  const kpis = plan.kpis || [];
  let currentRow = 5;

  const objTitle = (o: any) => o.objective || o.title || o.name || o.businessObjective || '';
  const objGoal = (o: any) => o.description || o.smartGoal || o.goal || (o.timeframe ? `Achieve within ${o.timeframe}` : '');
  const linksToObj = (k: any, oid: string) => (k.businessObjectiveId ?? k.objectiveId ?? k.objId) === oid;
  const kpiDef = (k: any) => k.definition || (k.dataSource ? `Tracked via ${k.dataSource}` : (k.formula ? `Calculated from: ${k.formula}` : ''));
  const kpiBaseline = (k: any) => k.baseline ?? k.currentValue ?? '';
  const kpiTargetDate = (k: any) => k.targetDate || k.deadline || k.frequency || '';
  const kpiPriority = (k: any, o: any) => k.priority || o.priority || 'High';

  objectives.forEach((obj: any, objIdx: number) => {
    const linked = kpis.filter((k: any) => linksToObj(k, obj.id));
    if (linked.length === 0) {
      if (currentRow > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, currentRow, COLS);
      writeValue(sheet, `A${currentRow}`, obj.id || `BO${objIdx + 1}`);
      writeValue(sheet, `B${currentRow}`, objTitle(obj));
      writeValue(sheet, `C${currentRow}`, objGoal(obj));
      currentRow++;
    } else {
      linked.forEach((kpi: any, ki: number) => {
        if (currentRow > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, currentRow, COLS);
        if (ki === 0) {
          writeValue(sheet, `A${currentRow}`, obj.id || `BO${objIdx + 1}`);
          writeValue(sheet, `B${currentRow}`, objTitle(obj));
          writeValue(sheet, `C${currentRow}`, objGoal(obj));
        }
        writeValue(sheet, `D${currentRow}`, kpi.name || '');
        writeValue(sheet, `E${currentRow}`, kpiDef(kpi));
        writeValue(sheet, `F${currentRow}`, kpi.formula || '');
        writeValue(sheet, `G${currentRow}`, kpiBaseline(kpi));
        writeValue(sheet, `H${currentRow}`, kpi.target || '');
        writeValue(sheet, `I${currentRow}`, kpiTargetDate(kpi));
        writeValue(sheet, `J${currentRow}`, kpiPriority(kpi, obj));
        currentRow++;
      });
    }
  });

  const usedKpiIds = new Set<string>();
  objectives.forEach((obj: any) => kpis.filter((k: any) => linksToObj(k, obj.id)).forEach((k: any) => usedKpiIds.add(k.id)));
  const orphanKpis = kpis.filter((k: any) => !usedKpiIds.has(k.id));
  orphanKpis.forEach((kpi: any) => {
    if (currentRow > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, currentRow, COLS);
    writeValue(sheet, `A${currentRow}`, '');
    writeValue(sheet, `B${currentRow}`, '');
    writeValue(sheet, `C${currentRow}`, '');
    writeValue(sheet, `D${currentRow}`, kpi.name || '');
    writeValue(sheet, `E${currentRow}`, kpiDef(kpi));
    writeValue(sheet, `F${currentRow}`, kpi.formula || '');
    writeValue(sheet, `G${currentRow}`, kpiBaseline(kpi));
    writeValue(sheet, `H${currentRow}`, kpi.target || '');
    writeValue(sheet, `I${currentRow}`, kpiTargetDate(kpi));
    writeValue(sheet, `J${currentRow}`, kpiPriority(kpi, {}));
    currentRow++;
  });
}

// ─── SHEET 4: METRICS & DIMENSIONS (metrics row = 6/8 cols, dimensions row = 22/5 cols) ───
function populateMetricsAndDimensions(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('4. Metrics & Dimensions');
  if (!sheet) return;
  const TMPL_ROW_M = 6, COLS_M = 8;

  const metrics = plan.metrics || plan.kpis?.map((k: any, i: number) => ({
    id: `M${String(i + 1).padStart(2, '0')}`, name: k.name,
    definition: `Supporting metric for ${k.name}`, unit: k.unit || '',
    linkedKPIs: [`KPI${i + 1}`], calculation: k.formula, type: 'Outcome', owner: k.owner || 'Analytics Team',
  })) || [];

  metrics.forEach((m: any, idx: number) => {
    const row = 6 + idx;
    if (row > TMPL_ROW_M) copyRowStyle(sheet, TMPL_ROW_M, row, COLS_M);
    writeValue(sheet, `A${row}`, m.id);
    writeValue(sheet, `B${row}`, m.name);
    writeValue(sheet, `C${row}`, m.definition);
    writeValue(sheet, `D${row}`, m.unit);
    writeValue(sheet, `E${row}`, Array.isArray(m.linkedKPIs) ? m.linkedKPIs.join(', ') : (m.linkedKPIs || ''));
    writeValue(sheet, `F${row}`, m.calculation);
    writeValue(sheet, `G${row}`, m.type);
    writeValue(sheet, `H${row}`, m.owner);
  });

  const TMPL_ROW_D = 22, COLS_D = 5;
  const dimensions = plan.customDimensions || [];
  dimensions.forEach((d: any, idx: number) => {
    const row = 22 + idx;
    if (row > TMPL_ROW_D) copyRowStyle(sheet, TMPL_ROW_D, row, COLS_D);
    writeValue(sheet, `A${row}`, d.id || `D${String(idx + 1).padStart(2, '0')}`);
    writeValue(sheet, `B${row}`, d.name);
    writeValue(sheet, `C${row}`, d.description);
    writeValue(sheet, `D${row}`, d.scope || 'Event');
    writeValue(sheet, `E${row}`, d.examples || '');
  });
}

// ─── SHEET 5: DATA SOURCES (template data row = 4, 9 columns) ───
function populateDataSources(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('5. Data Sources');
  if (!sheet) return;
  const TMPL_ROW = 4, COLS = 9;
  const sources = plan.recommendedTools || plan.dataSources || [];
  sources.forEach((src: any, idx: number) => {
    const row = 4 + idx;
    if (row > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, row, COLS);
    writeValue(sheet, `A${row}`, src.id || `DS${String(idx + 1).padStart(2, '0')}`);
    writeValue(sheet, `B${row}`, src.name || src.tool);
    writeValue(sheet, `C${row}`, src.dataType || 'Behavioral');
    writeValue(sheet, `D${row}`, src.metricsSourced || src.description);
    writeValue(sheet, `E${row}`, src.refreshFrequency || 'Real-time');
    writeValue(sheet, `F${row}`, src.latency || '< 5 min');
    writeValue(sheet, `G${row}`, src.owner || 'Analytics Team');
    writeValue(sheet, `H${row}`, src.access || 'Restricted');
    writeValue(sheet, `I${row}`, src.notes || `Priority: ${src.priority || 'Recommended'}`);
  });
}

// ─── SHEET 6: TRACKING PLAN (template data row = 5, 10 columns) ───
function populateTrackingPlan(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('6. Tracking Plan');
  if (!sheet) return;
  const TMPL_ROW = 5, COLS = 10;
  const events = plan.events || [];
  events.forEach((e: any, idx: number) => {
    const row = 5 + idx;
    if (row > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, row, COLS);
    writeValue(sheet, `A${row}`, e.id || `E${String(idx + 1).padStart(2, '0')}`);
    writeValue(sheet, `B${row}`, e.eventName || e.name);
    writeValue(sheet, `C${row}`, e.description);
    writeValue(sheet, `D${row}`, e.trigger);
    writeValue(sheet, `E${row}`, Array.isArray(e.parameters)
      ? e.parameters.map((p: any) => typeof p === 'string' ? p : p.name).join(', ') : (e.parameters || ''));
    writeValue(sheet, `F${row}`, e.pageScreen || e.page || '');
    writeValue(sheet, `G${row}`, e.platform || 'Web');
    writeValue(sheet, `H${row}`, e.linkedMetric || '');
    writeValue(sheet, `I${row}`, e.status || 'Planned');
    writeValue(sheet, `J${row}`, e.owner || 'Engineering');
  });
}

// ─── SHEET 7: REPORTING CADENCE (template data row = 5, 6 columns) ───
function populateReportingCadence(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('7. Reporting Cadence');
  if (!sheet) return;
  const TMPL_ROW = 5, COLS = 6;
  const reports = plan.reports || [
    { name: 'Executive Dashboard', audience: 'C-Suite, VP', frequency: 'Monthly', keyMetrics: 'Revenue, Conversion Rate, CAC', owner: 'Analytics Lead' },
    { name: 'Marketing Performance', audience: 'Marketing Team', frequency: 'Weekly', keyMetrics: 'Sessions, Leads, Channel Performance', owner: 'Marketing Analyst' },
    { name: 'Product Analytics', audience: 'Product Team', frequency: 'Weekly', keyMetrics: 'Feature Usage, Retention, Engagement', owner: 'Product Analyst' },
    { name: 'Real-time Monitor', audience: 'Operations', frequency: 'Daily', keyMetrics: 'Site Performance, Error Rates, Traffic', owner: 'DevOps' },
    { name: 'Campaign Report', audience: 'Marketing, Finance', frequency: 'Per Campaign', keyMetrics: 'ROAS, CPA, Conversions by Channel', owner: 'Performance Marketing' },
  ];
  reports.forEach((r: any, idx: number) => {
    const row = 5 + idx;
    if (row > TMPL_ROW) copyRowStyle(sheet, TMPL_ROW, row, COLS);
    writeValue(sheet, `A${row}`, r.name);
    writeValue(sheet, `B${row}`, r.audience);
    writeValue(sheet, `C${row}`, r.frequency);
    writeValue(sheet, `D${row}`, r.keyMetrics);
    writeValue(sheet, `E${row}`, r.owner);
    writeValue(sheet, `F${row}`, r.notes || '');
  });
}

// ─── SHEET 8: RACI (write legend on row 2, then sign-off values) ───
function populateRACI(wb: ExcelJS.Workbook, plan: any) {
  const sheet = wb.getWorksheet('8. RACI & Sign-off');
  if (!sheet) return;

  const LEGEND = [
    { col: 'A', text: 'Legend:', font: { size: 10, bold: true, color: { argb: 'FF374151' } } },
    { col: 'B', text: 'R = Responsible (does the work)', font: { size: 10, color: { argb: 'FF1E40AF' } } },
    { col: 'C', text: 'A = Accountable (owns outcome)', font: { size: 10, color: { argb: 'FF991B1B' } } },
    { col: 'D', text: 'C = Consulted (provides input)', font: { size: 10, color: { argb: 'FF92400E' } } },
    { col: 'E', text: 'I = Informed (kept in the loop)', font: { size: 10, color: { argb: 'FF065F46' } } },
  ];
  LEGEND.forEach(({ col, text, font }) => {
    const cell = sheet.getCell(`${col}2`);
    cell.value = text;
    cell.font = font;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  sheet.getRow(2).height = 22;

  if (plan.signoff) {
    plan.signoff.forEach((s: any, idx: number) => {
      const row = 17 + idx;
      writeValue(sheet, `B${row}`, s.name || '');
      writeValue(sheet, `C${row}`, s.decision || '');
      writeValue(sheet, `D${row}`, s.date || '');
      writeValue(sheet, `E${row}`, s.comments || '');
    });
  }
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
      { col: 'D', label: 'OBJECTIVES', value: (plan.businessObjectives || []).length, color: 'FF92400E', bg: 'FFFEF3C7' },
      { col: 'E', label: 'DIMENSIONS', value: (plan.customDimensions || []).length, color: 'FF6D28D9', bg: 'FFEDE9FE' },
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
    if (plan.implementationPlan?.[0]?.tasks?.length) priorities = plan.implementationPlan[0].tasks.slice(0, 3);
    else if (plan.businessObjectives?.length) priorities = plan.businessObjectives.slice(0, 3).map((o: any) => o.title || o.goal || o.name || String(o));
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
