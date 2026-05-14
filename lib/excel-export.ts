/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';
import { sanitizePlan } from './sanitize-plan';

// Brand colors
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
const ALT_ROW_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
const BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFE5E7EB' } };
const SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
const INPUT_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

function styleHeader(row: ExcelJS.Row, colCount?: number) {
  const count = colCount || row.cellCount;
  for (let c = 1; c <= count; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  }
  row.height = 28;
}

function styleDataRows(sheet: ExcelJS.Worksheet, startRow: number, colCount?: number) {
  for (let i = startRow; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const cols = colCount || row.cellCount;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.font = { size: 11 };
      if (i % 2 === 0) {
        cell.fill = ALT_ROW_FILL;
      }
    }
  }
}

function styleTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 18, color: { argb: 'FF2F5496' } };
}

function styleSubtitle(cell: ExcelJS.Cell) {
  cell.font = { italic: true, size: 11, color: { argb: 'FF808080' } };
}

function styleSectionHeader(cell: ExcelJS.Cell) {
  cell.fill = SECTION_FILL;
  cell.font = SECTION_FONT;
}

export async function generateExcel(plan: any, score?: any): Promise<ExcelJS.Buffer> {
  plan = sanitizePlan(plan);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Web Analytics Measurement Plan Agent';
  workbook.created = new Date();

  // ===== SHEET 1: OVERVIEW =====
  const wsOverview = workbook.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsOverview.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 60 },
  ];
  styleHeader(wsOverview.getRow(1), 2);

  const overviewData: [string, string][] = [
    ['Website URL', plan.websiteInfo?.url || ''],
    ['Title', plan.websiteInfo?.title || ''],
    ['Description', plan.websiteInfo?.description || ''],
    ['Industry', plan.websiteInfo?.industry || ''],
    ['Business type', plan.websiteInfo?.businessType || ''],
    ['Estimated scale', plan.websiteInfo?.estimatedScale || ''],
    ['Primary goal', plan.websiteInfo?.primaryGoal || ''],
    ['Detected tech', (plan.websiteInfo?.detectedTech || []).join(', ')],
    ['', ''],
    ['Health score', score ? `${score.total || 0} / ${score.maxTotal || 100}` : 'N/A'],
    ['Grade', score?.grade || 'N/A'],
    ['Verdict', score?.verdict || ''],
    ['', ''],
    ['Business objectives', String(plan.businessObjectives?.length || 0)],
    ['KPIs defined', String(plan.kpis?.length || 0)],
    ['Events to track', String(plan.events?.length || 0)],
    ['Custom dimensions', String(plan.customDimensions?.length || 0)],
    ['Conversion goals', String(plan.conversionGoals?.length || 0)],
    ['', ''],
    ['Generated', new Date().toLocaleString()],
  ];
  overviewData.forEach(([f, v]) => wsOverview.addRow({ field: f, value: v }));
  styleDataRows(wsOverview, 2, 2);

  // ===== SHEET 2: BUSINESS OBJECTIVES =====
  const wsObj = workbook.addWorksheet('Objectives', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsObj.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Objective', key: 'objective', width: 35 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Timeframe', key: 'timeframe', width: 18 },
    { header: 'Related features', key: 'related', width: 30 },
  ];
  styleHeader(wsObj.getRow(1), 6);
  (plan.businessObjectives || []).forEach((o: any) => wsObj.addRow({
    id: o.id, objective: o.objective, description: o.description,
    priority: o.priority, timeframe: o.timeframe,
    related: (o.relatedFeatures || []).join(', '),
  }));
  styleDataRows(wsObj, 2, 6);
  wsObj.autoFilter = { from: 'A1', to: 'F1' };

  // ===== SHEET 3: KPIs =====
  const wsKpi = workbook.addWorksheet('KPIs', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsKpi.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'KPI name', key: 'name', width: 30 },
    { header: 'Linked objective', key: 'obj', width: 15 },
    { header: 'Formula', key: 'formula', width: 45 },
    { header: 'Target', key: 'target', width: 20 },
    { header: 'Frequency', key: 'freq', width: 14 },
    { header: 'Data source', key: 'source', width: 20 },
    { header: 'Owner', key: 'owner', width: 18 },
  ];
  styleHeader(wsKpi.getRow(1), 8);
  (plan.kpis || []).forEach((k: any) => wsKpi.addRow({
    id: k.id, name: k.name, obj: k.businessObjectiveId,
    formula: k.formula, target: k.target, freq: k.frequency,
    source: k.dataSource || 'GA4', owner: k.owner,
  }));
  styleDataRows(wsKpi, 2, 8);
  wsKpi.autoFilter = { from: 'A1', to: 'H1' };

  // ===== SHEET 4: EVENTS =====
  const wsEvt = workbook.addWorksheet('Events', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsEvt.columns = [
    { header: 'Event name', key: 'name', width: 28 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Trigger', key: 'trigger', width: 45 },
    { header: 'Element selector', key: 'selector', width: 30 },
    { header: 'Parameters', key: 'params', width: 50 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Linked feature', key: 'feature', width: 25 },
  ];
  styleHeader(wsEvt.getRow(1), 7);
  (plan.events || []).forEach((e: any) => wsEvt.addRow({
    name: e.eventName, category: e.category, trigger: e.trigger,
    selector: e.elementSelector || '',
    params: (e.parameters || []).map((p: any) => `${p.name} (${p.type})`).join(', '),
    priority: e.priority, feature: e.linkedFeature || '',
  }));
  styleDataRows(wsEvt, 2, 7);
  wsEvt.autoFilter = { from: 'A1', to: 'G1' };

  // Color-code priority column
  wsEvt.getColumn('priority').eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum === 1) return;
    const v = cell.value?.toString().toLowerCase() || '';
    if (v.includes('must')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    else if (v.includes('should')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    else if (v.includes('nice')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  });

  // ===== SHEET 5: EVENT PARAMETERS (denormalized) =====
  const wsParams = workbook.addWorksheet('Event Parameters', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsParams.columns = [
    { header: 'Event name', key: 'event', width: 28 },
    { header: 'Parameter', key: 'param', width: 25 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Required', key: 'required', width: 12 },
    { header: 'Description', key: 'desc', width: 45 },
    { header: 'Example', key: 'example', width: 25 },
  ];
  styleHeader(wsParams.getRow(1), 6);
  (plan.events || []).forEach((e: any) => {
    (e.parameters || []).forEach((p: any) => wsParams.addRow({
      event: e.eventName, param: p.name, type: p.type,
      required: p.required ? 'Yes' : 'No', desc: p.description, example: p.example,
    }));
  });
  styleDataRows(wsParams, 2, 6);
  wsParams.autoFilter = { from: 'A1', to: 'F1' };

  // ===== SHEET 6: CUSTOM DIMENSIONS =====
  const wsDim = workbook.addWorksheet('Dimensions', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsDim.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Scope', key: 'scope', width: 15 },
    { header: 'Description', key: 'desc', width: 50 },
    { header: 'Example values', key: 'examples', width: 35 },
    { header: 'Capture method', key: 'method', width: 25 },
  ];
  styleHeader(wsDim.getRow(1), 5);
  (plan.customDimensions || []).forEach((d: any) => wsDim.addRow({
    name: d.name, scope: d.scope, desc: d.description,
    examples: (d.exampleValues || []).join(', '), method: d.captureMethod || '',
  }));
  styleDataRows(wsDim, 2, 5);
  wsDim.autoFilter = { from: 'A1', to: 'E1' };

  // ===== SHEET 7: CONVERSIONS =====
  const wsConv = workbook.addWorksheet('Conversions', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsConv.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Event', key: 'event', width: 25 },
    { header: 'Value', key: 'value', width: 18 },
    { header: 'Expected rate', key: 'rate', width: 14 },
    { header: 'Business impact', key: 'impact', width: 45 },
  ];
  styleHeader(wsConv.getRow(1), 6);
  (plan.conversionGoals || []).forEach((c: any) => wsConv.addRow({
    name: c.name, type: c.type, event: c.event,
    value: c.value, rate: c.expectedRate || '', impact: c.businessImpact,
  }));
  styleDataRows(wsConv, 2, 6);
  wsConv.autoFilter = { from: 'A1', to: 'F1' };

  // ===== SHEET 8: IMPLEMENTATION =====
  const wsImpl = workbook.addWorksheet('Implementation', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsImpl.columns = [
    { header: 'Phase', key: 'phase', width: 8 },
    { header: 'Phase name', key: 'name', width: 25 },
    { header: 'Duration', key: 'duration', width: 15 },
    { header: 'Tasks', key: 'tasks', width: 60 },
    { header: 'Deliverables', key: 'deliverables', width: 40 },
    { header: 'Dependencies', key: 'deps', width: 30 },
  ];
  styleHeader(wsImpl.getRow(1), 6);
  (plan.implementationPlan || []).forEach((p: any) => wsImpl.addRow({
    phase: p.phase, name: p.phaseName, duration: p.duration,
    tasks: (p.tasks || []).join('\n'), deliverables: (p.deliverables || []).join('\n'),
    deps: (p.dependencies || []).join('\n'),
  }));
  styleDataRows(wsImpl, 2, 6);

  // ===== SHEET 9: TOOLS =====
  const wsTools = workbook.addWorksheet('Recommended Tools', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsTools.columns = [
    { header: 'Tool', key: 'name', width: 28 },
    { header: 'Purpose', key: 'purpose', width: 45 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Est. cost', key: 'cost', width: 18 },
    { header: 'Alternatives', key: 'alts', width: 30 },
  ];
  styleHeader(wsTools.getRow(1), 5);
  (plan.recommendedTools || []).forEach((t: any) => wsTools.addRow({
    name: t.name, purpose: t.purpose, priority: t.priority,
    cost: t.estimatedCost || '', alts: (t.alternativeTools || []).join(', '),
  }));
  styleDataRows(wsTools, 2, 5);

  // ===== SHEET 10: HEALTH SCORE =====
  if (score) {
    const wsScore = workbook.addWorksheet('Health Score', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsScore.columns = [
      { header: 'Dimension', key: 'dim', width: 25 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Max', key: 'max', width: 8 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Findings', key: 'findings', width: 50 },
      { header: 'Fixes', key: 'fixes', width: 50 },
    ];
    styleHeader(wsScore.getRow(1), 6);

    // Overall score row
    wsScore.addRow({
      dim: 'OVERALL', score: score.total, max: score.maxTotal,
      status: score.grade, findings: score.verdict, fixes: '',
    });
    const overallRow = wsScore.getRow(2);
    overallRow.font = { bold: true, size: 12 };

    // Dimension rows
    (score.dimensions || []).forEach((d: any) => {
      wsScore.addRow({
        dim: d.name, score: d.score, max: d.maxScore, status: d.status,
        findings: (d.findings || []).join('; '),
        fixes: (d.fixes || []).map((f: any) => `[${f.priority}] ${f.action}`).join('; '),
      });
    });
    styleDataRows(wsScore, 2, 6);

    // Color-code status
    wsScore.getColumn('status').eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum === 1) return;
      const v = cell.value?.toString().toLowerCase() || '';
      if (v === 'excellent' || v.startsWith('a')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      else if (v === 'good' || v === 'b') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      else if (v === 'fair' || v === 'c') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      else if (v === 'poor' || v === 'd') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
      else if (v === 'missing' || v === 'f') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });

    // Top fixes section
    if (score.topFixes?.length > 0) {
      const fixStartRow = wsScore.rowCount + 2;
      const fixTitleCell = wsScore.getCell(`A${fixStartRow}`);
      fixTitleCell.value = 'TOP PRIORITY FIXES';
      styleSectionHeader(fixTitleCell);
      wsScore.mergeCells(`A${fixStartRow}:F${fixStartRow}`);

      const fixHeader = wsScore.getRow(fixStartRow + 1);
      fixHeader.values = ['Priority', 'Action', 'Dimension', 'Impact', '', ''];
      styleHeader(fixHeader, 4);

      score.topFixes.forEach((f: any) => {
        wsScore.addRow({ dim: f.priority, score: '', max: '', status: '', findings: f.action, fixes: f.impact });
      });
    }
  }

  // ===== SHEET 11: USER JOURNEYS =====
  const wsJourney = workbook.addWorksheet('User Journeys', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsJourney.columns = [
    { header: 'Journey', key: 'name', width: 25 },
    { header: 'Persona', key: 'persona', width: 20 },
    { header: 'Stages', key: 'stages', width: 40 },
    { header: 'Touchpoints', key: 'touchpoints', width: 40 },
    { header: 'Critical moments', key: 'critical', width: 35 },
    { header: 'Drop-off risks', key: 'risks', width: 35 },
  ];
  styleHeader(wsJourney.getRow(1), 6);
  (plan.userJourneys || []).forEach((j: any) => wsJourney.addRow({
    name: j.name, persona: j.persona || '',
    stages: (j.stages || []).join(' > '),
    touchpoints: (j.touchpoints || []).join(', '),
    critical: (j.criticalMoments || []).join(', '),
    risks: (j.dropOffRisks || []).join(', '),
  }));
  styleDataRows(wsJourney, 2, 6);

  // ===== SHEET 12: GTM CONFIG =====
  if (plan.gtmConfiguration) {
    const wsGtm = workbook.addWorksheet('GTM Config');
    wsGtm.columns = [
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Item', key: 'item', width: 60 },
    ];
    styleHeader(wsGtm.getRow(1), 2);
    ['tags', 'triggers', 'variables'].forEach(section => {
      (plan.gtmConfiguration[section] || []).forEach((item: any) => {
        wsGtm.addRow({ type: section, item: typeof item === 'string' ? item : JSON.stringify(item) });
      });
    });
    styleDataRows(wsGtm, 2, 2);
  }

  // ===== SHEET 13: INSIGHTS =====
  const wsInsights = workbook.addWorksheet('Insights');
  wsInsights.columns = [
    { header: 'Category', key: 'cat', width: 20 },
    { header: 'Insight', key: 'insight', width: 70 },
  ];
  styleHeader(wsInsights.getRow(1), 2);
  ['strengths', 'opportunities', 'risks', 'quickWins', 'competitiveBenchmarks'].forEach(key => {
    (plan.insights?.[key] || []).forEach((item: string) => {
      wsInsights.addRow({ cat: key, insight: item });
    });
  });
  styleDataRows(wsInsights, 2, 2);

  // ===== SHEET 14: GLOSSARY =====
  const wsGloss = workbook.addWorksheet('Glossary');
  wsGloss.columns = [
    { header: 'Term', key: 'term', width: 30 },
    { header: 'Definition', key: 'def', width: 55 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  styleHeader(wsGloss.getRow(1), 3);
  const glossary = [
    ['KPI', 'A headline metric indicating success against an objective.', 'Usually 1-3 per goal'],
    ['Metric', 'A quantifiable measurement of activity or outcome.', 'Many metrics support one KPI'],
    ['Dimension', 'A descriptive attribute used to slice metrics.', 'e.g. channel, geography'],
    ['Baseline', 'Current value of a metric before intervention.', ''],
    ['Target', 'Desired KPI value within a defined timeframe.', 'Should be SMART'],
    ['Event', 'A user or system action captured by analytics.', 'e.g. page_view, purchase'],
    ['Parameter', 'Attribute attached to an event giving context.', 'e.g. product_id'],
    ['Data Layer', 'JS object passing info from site to tag manager.', 'Used with GTM'],
    ['GA4', 'Google Analytics 4 - event-based analytics.', 'Successor to UA'],
    ['GTM', 'Google Tag Manager - tag management system.', ''],
    ['Macro conversion', 'Primary business goal (purchase, signup).', ''],
    ['Micro conversion', 'Leading indicator (newsletter, add to cart).', ''],
    ['RACI', 'Responsible, Accountable, Consulted, Informed.', ''],
    ['Attribution', 'Assigning credit for outcomes to sources.', 'First-touch, last-touch, multi-touch'],
    ['CMP', 'Consent Management Platform.', 'e.g. OneTrust, Cookiebot'],
    ['Consent Mode', 'Google feature to model conversions from consent denials.', 'v2 required for EEA'],
  ];
  glossary.forEach(([term, def, notes]) => wsGloss.addRow({ term, def, notes }));
  styleDataRows(wsGloss, 2, 3);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
