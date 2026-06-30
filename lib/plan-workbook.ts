// plan-workbook.ts — the "impressive" measurement-plan Excel workbook, built 100%
// in code (no binary template) so it's fully controllable and reads the enriched
// MeasurementPlan. Classic corporate look: navy header bands, blue accents,
// banded tables, branded "Sirah Digital". Produced for the new-plan download/email.

/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';

// ── Palette (classic corporate navy/blue) ────────────────────────────────────
const NAVY = 'FF0F2747';
const BLUE = 'FF1E40AF';
const STEEL = 'FF9DB4D6'; // light steel-blue for the brand kicker on navy
const ZEBRA = 'FFF6F9FC';
const BAND = 'FFEEF3FA';
const BORDER = 'FFD6DEE8';
const INK = 'FF1F2937';
const MUTED = 'FF6B7280';
const WHITE = 'FFFFFFFF';
const KEY_FILL = 'FFFFF3D6'; // subtle gold for key-event rows
const GREEN = 'FF067647';
const AMBER = 'FFB45309';

const BRAND = 'Sirah Digital';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const thin = (argb = BORDER): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb } });
const allBorders = (argb = BORDER) => ({ top: thin(argb), left: thin(argb), right: thin(argb), bottom: thin(argb) });
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// A branded header band atop every sheet (kicker + title + optional subtitle).
function sheetHeader(sheet: ExcelJS.Worksheet, colCount: number, title: string, subtitle?: string) {
  const last = colLetter(colCount);
  sheet.mergeCells(`A1:${last}1`);
  sheet.mergeCells(`A2:${last}2`);
  if (subtitle) sheet.mergeCells(`A3:${last}3`);
  for (let c = 1; c <= colCount; c++) sheet.getCell(1, c).fill = fill(NAVY);
  const kicker = sheet.getCell('A1');
  kicker.value = `${BRAND.toUpperCase()}  ·  MEASUREMENT PLAN`;
  kicker.font = { bold: true, size: 9, color: { argb: STEEL } };
  kicker.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(1).height = 22;
  const h = sheet.getCell('A2');
  h.value = title;
  h.font = { bold: true, size: 16, color: { argb: NAVY } };
  h.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 26;
  if (subtitle) {
    const s = sheet.getCell('A3');
    s.value = subtitle;
    s.font = { size: 10, color: { argb: MUTED }, italic: true };
    s.alignment = { vertical: 'middle', indent: 1 };
    sheet.getRow(3).height = 16;
  }
}

interface Col { h: string; w: number; }

// A navy table header row (returns the first data row index). Freezes everything
// above it so headers stay visible on scroll.
function tableHeader(sheet: ExcelJS.Worksheet, row: number, cols: Col[]): number {
  cols.forEach((c, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = c.h;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = fill(NAVY);
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    cell.border = allBorders(NAVY);
    sheet.getColumn(i + 1).width = c.w;
  });
  sheet.getRow(row).height = 22;
  sheet.views = [{ state: 'frozen', ySplit: row }];
  return row + 1;
}

function dataRow(sheet: ExcelJS.Worksheet, row: number, values: any[], opts?: { highlight?: boolean }) {
  const band = opts?.highlight ? KEY_FILL : row % 2 === 0 ? ZEBRA : WHITE;
  values.forEach((v, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = v ?? '';
    cell.font = { size: 10, color: { argb: INK } };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    cell.border = allBorders();
    cell.fill = fill(band);
  });
  sheet.getRow(row).height = 17;
}

function yesNo(v: boolean, yes = 'Yes', no = '—') { return v ? yes : no; }

// ── Sheets ───────────────────────────────────────────────────────────────────

function buildCover(wb: ExcelJS.Workbook, plan: any, score: any) {
  const s = wb.addWorksheet('Cover', { properties: { defaultRowHeight: 16 }, views: [{ showGridLines: false }] });
  const COLS = 6;
  for (let c = 1; c <= COLS; c++) s.getColumn(c).width = c === 1 ? 4 : 20;

  // Navy hero band (rows 2–8)
  for (let r = 2; r <= 8; r++) for (let c = 1; c <= COLS; c++) s.getCell(r, c).fill = fill(r <= 8 ? NAVY : WHITE);
  s.mergeCells('B2:F2'); const kick = s.getCell('B2');
  kick.value = BRAND.toUpperCase(); kick.font = { bold: true, size: 11, color: { argb: STEEL } }; kick.alignment = { vertical: 'middle' };
  s.mergeCells('B4:F5'); const title = s.getCell('B4');
  title.value = 'Measurement Plan'; title.font = { bold: true, size: 30, color: { argb: WHITE } }; title.alignment = { vertical: 'middle' };
  s.mergeCells('B6:F6'); const sub = s.getCell('B6');
  sub.value = plan?.meta?.url || 'Website analytics measurement plan'; sub.font = { size: 13, color: { argb: STEEL } }; sub.alignment = { vertical: 'middle' };
  s.getRow(4).height = 26; s.getRow(5).height = 22;

  // Metadata block
  const meta = plan?.meta || {};
  const rows: Array<[string, string]> = [
    ['Website', meta.url || '—'],
    ['Business model', String(meta.businessModel || '—')],
    ['Vertical', String(meta.vertical || '—')],
    ['Classification confidence', meta.classificationConfidence !== undefined ? `${Math.round((meta.classificationConfidence || 0) * 100)}%` : '—'],
    ['Plan source', meta.source === 'template' ? 'Template baseline' : 'AI-generated'],
    ['Schema version', String(meta.schemaVersion || '1.0.0')],
    ['Generated', meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US')],
  ];
  let r = 11;
  s.mergeCells(`B${r}:F${r}`); const oh = s.getCell(`B${r}`);
  oh.value = 'OVERVIEW'; oh.font = { bold: true, size: 10, color: { argb: BLUE } }; r++;
  s.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: BLUE } } }; s.mergeCells(`B${r}:F${r}`); r++;
  for (const [k, v] of rows) {
    const lc = s.getCell(`B${r}`); lc.value = k; lc.font = { size: 10, color: { argb: MUTED }, bold: true }; lc.alignment = { vertical: 'middle' };
    s.mergeCells(`C${r}:F${r}`); const vc = s.getCell(`C${r}`); vc.value = v; vc.font = { size: 11, color: { argb: INK } }; vc.alignment = { vertical: 'middle' };
    s.getRow(r).height = 18; r++;
  }

  // Optional score chip
  const total = typeof score === 'number' ? score : score?.total;
  if (typeof total === 'number') {
    r++;
    const chip = s.getCell(`B${r}`); chip.value = `Tracking readiness score: ${total}/100`;
    chip.font = { bold: true, size: 11, color: { argb: total >= 70 ? GREEN : total >= 50 ? AMBER : 'FFB91C1C' } };
    r++;
  }

  // What's inside
  r += 1;
  const ch = s.getCell(`B${r}`); ch.value = "WHAT'S INSIDE"; ch.font = { bold: true, size: 10, color: { argb: BLUE } }; r++;
  s.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: BLUE } } }; s.mergeCells(`B${r}:F${r}`); r++;
  const contents = ['Summary', 'KPIs', 'Events', 'Event parameters', 'Data layer', 'Custom dimensions', 'Consent', 'Tooling'];
  for (const item of contents) {
    const c = s.getCell(`B${r}`); c.value = `•  ${item}`; c.font = { size: 10, color: { argb: INK } }; s.getRow(r).height = 16; r++;
  }

  // Footer credit
  r += 2;
  s.mergeCells(`B${r}:F${r}`); const f = s.getCell(`B${r}`);
  f.value = `Prepared by ${BRAND} · AI-powered analytics setup`;
  f.font = { size: 9, italic: true, color: { argb: MUTED } };
}

function buildSummary(wb: ExcelJS.Workbook, plan: any) {
  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sheetHeader(s, 6, 'Summary', plan?.meta?.url || '');
  const events = plan?.events || [];
  const params = events.reduce((n: number, e: any) => n + (e.parameters?.length || 0), 0);
  const stats: Array<[string, string | number]> = [
    ['KPIs', (plan?.kpis || []).length],
    ['Events', events.length],
    ['Key events', events.filter((e: any) => e.isKeyEvent).length],
    ['Event parameters', params],
    ['Data layer variables', (plan?.dataLayer || []).length],
    ['Custom dimensions', (plan?.tooling?.ga4?.customDimensions || []).length],
  ];
  // 3×2 stat tiles starting at B5
  let idx = 0;
  for (let row = 0; row < 2; row++) {
    for (let cIndex = 0; cIndex < 3; cIndex++) {
      const [label, value] = stats[idx++];
      const top = 5 + row * 4;
      const colStart = 1 + cIndex * 2; // A,C,E pairs
      const a = colLetter(colStart), b = colLetter(colStart + 1);
      s.mergeCells(`${a}${top}:${b}${top}`);
      s.mergeCells(`${a}${top + 1}:${b}${top + 1}`);
      const vcell = s.getCell(`${a}${top}`);
      vcell.value = value; vcell.font = { bold: true, size: 26, color: { argb: NAVY } }; vcell.alignment = { vertical: 'middle', horizontal: 'center' };
      const lcell = s.getCell(`${a}${top + 1}`);
      lcell.value = String(label).toUpperCase(); lcell.font = { size: 9, bold: true, color: { argb: MUTED } }; lcell.alignment = { vertical: 'middle', horizontal: 'center' };
      for (const cc of [`${a}${top}`, `${a}${top + 1}`]) s.getCell(cc).fill = fill(BAND);
      s.getCell(`${a}${top}`).border = { top: thin(), left: thin() }; s.getCell(`${b}${top}`).border = { top: thin(), right: thin() };
      s.getRow(top).height = 34;
    }
  }
  for (let c = 1; c <= 6; c++) s.getColumn(c).width = 16;

  // Narrative
  const note = s.getCell('A14');
  s.mergeCells('A14:F16');
  const consent = plan?.consent || {};
  note.value = `This measurement plan defines what to track for ${plan?.meta?.url || 'the website'} (${plan?.meta?.businessModel || 'business'}). It covers ${events.length} GA4 events (${events.filter((e: any) => e.isKeyEvent).length} key conversions), their parameters and dataLayer, custom dimensions, and a Consent Mode baseline${consent.consentModeRequired ? ' (required)' : ''}. Each sheet is ready to hand to a developer or import into GA4/GTM.`;
  note.font = { size: 10, color: { argb: INK } }; note.alignment = { vertical: 'top', wrapText: true };
}

function buildKpis(wb: ExcelJS.Workbook, plan: any, nameById: Map<string, string>) {
  const s = wb.addWorksheet('KPIs', { views: [{ showGridLines: false }] });
  sheetHeader(s, 5, 'KPIs', 'Key performance indicators and the events that measure them');
  let row = tableHeader(s, 5, [
    { h: 'ID', w: 14 }, { h: 'KPI', w: 26 }, { h: 'Description', w: 44 }, { h: 'Metric', w: 24 }, { h: 'Measured by', w: 34 },
  ]);
  for (const k of plan?.kpis || []) {
    const linked = (k.linkedEventIds || []).map((id: string) => nameById.get(id) || id).join(', ');
    dataRow(s, row++, [k.id || '', k.name || '', k.description || '', k.metric || '', linked]);
  }
}

function buildEvents(wb: ExcelJS.Workbook, plan: any) {
  const s = wb.addWorksheet('Events', { views: [{ showGridLines: false }] });
  sheetHeader(s, 8, 'Events', 'GA4 events — key conversions are highlighted');
  let row = tableHeader(s, 5, [
    { h: '#', w: 5 }, { h: 'Event name', w: 24 }, { h: 'Category', w: 14 }, { h: 'Key', w: 7 },
    { h: 'Consent', w: 9 }, { h: 'Trigger type', w: 16 }, { h: 'Trigger', w: 34 }, { h: 'Description', w: 40 },
  ]);
  (plan?.events || []).forEach((e: any, i: number) => {
    dataRow(s, row++, [
      i + 1, e.name || '', e.category || '', yesNo(!!e.isKeyEvent, '★', '—'),
      yesNo(!!e.requiresConsent), e.triggerType || '—', e.trigger || '', e.description || '',
    ], { highlight: !!e.isKeyEvent });
  });
}

function buildParameters(wb: ExcelJS.Workbook, plan: any) {
  const s = wb.addWorksheet('Event parameters', { views: [{ showGridLines: false }] });
  sheetHeader(s, 6, 'Event parameters', 'Per-event GA4 parameters and where each value comes from');
  let row = tableHeader(s, 5, [
    { h: 'Event', w: 24 }, { h: 'Parameter', w: 20 }, { h: 'Type', w: 10 }, { h: 'Required', w: 10 }, { h: 'Source', w: 12 }, { h: 'Description', w: 46 },
  ]);
  for (const e of plan?.events || []) {
    for (const p of e.parameters || []) {
      dataRow(s, row++, [e.name || '', p.name || '', p.type || '', yesNo(!!p.required), p.source || '', p.description || '']);
    }
  }
  if (row === 6) dataRow(s, row, ['—', 'No parameters in this plan', '', '', '', '']);
}

function buildDataLayer(wb: ExcelJS.Workbook, plan: any, nameById: Map<string, string>) {
  const s = wb.addWorksheet('Data layer', { views: [{ showGridLines: false }] });
  sheetHeader(s, 5, 'Data layer', 'Variables a developer pushes to window.dataLayer');
  let row = tableHeader(s, 5, [
    { h: 'Variable', w: 22 }, { h: 'Type', w: 10 }, { h: 'Description', w: 44 }, { h: 'Example', w: 30 }, { h: 'Used by', w: 34 },
  ]);
  for (const d of plan?.dataLayer || []) {
    const used = (d.usedByEventIds || []).map((id: string) => nameById.get(id) || id).join(', ');
    dataRow(s, row++, [d.key || '', d.type || '', d.description || '', String(d.example ?? ''), used]);
  }
  if (row === 6) dataRow(s, row, ['—', '', 'No dataLayer variables in this plan', '', '']);
}

function buildCustomDimensions(wb: ExcelJS.Workbook, plan: any) {
  const s = wb.addWorksheet('Custom dimensions', { views: [{ showGridLines: false }] });
  sheetHeader(s, 3, 'Custom dimensions', 'GA4 custom dimensions to register');
  let row = tableHeader(s, 5, [{ h: 'Name', w: 28 }, { h: 'Scope', w: 14 }, { h: 'Parameter', w: 28 }]);
  for (const d of plan?.tooling?.ga4?.customDimensions || []) {
    dataRow(s, row++, [d.name || '', d.scope || '', d.parameter || '']);
  }
  if (row === 6) dataRow(s, row, ['No custom dimensions in this plan', '', '']);
}

function buildConsent(wb: ExcelJS.Workbook, plan: any) {
  const s = wb.addWorksheet('Consent', { views: [{ showGridLines: false }] });
  sheetHeader(s, 4, 'Consent', 'Consent Mode baseline and per-event requirement');
  const c = plan?.consent || {};
  let r = 5;
  const meta: Array<[string, string]> = [
    ['Consent Mode required', c.consentModeRequired ? 'Yes' : 'No'],
    ['Categories used', (c.categoriesUsed || []).join(', ') || '—'],
    ['Notes', c.notes || '—'],
  ];
  for (const [k, v] of meta) {
    const lc = s.getCell(`A${r}`); lc.value = k; lc.font = { bold: true, size: 10, color: { argb: MUTED } }; lc.alignment = { vertical: 'top' };
    s.mergeCells(`B${r}:D${r}`); const vc = s.getCell(`B${r}`); vc.value = v; vc.font = { size: 10, color: { argb: INK } }; vc.alignment = { vertical: 'top', wrapText: true };
    s.getColumn(1).width = 26; s.getRow(r).height = 20; r++;
  }
  r += 1;
  let row = tableHeader(s, r, [{ h: 'Event', w: 26 }, { h: 'Requires consent', w: 18 }, { h: 'Category', w: 16 }, { h: 'Key event', w: 12 }]);
  for (const e of plan?.events || []) {
    dataRow(s, row++, [e.name || '', yesNo(!!e.requiresConsent), e.category || '', yesNo(!!e.isKeyEvent, '★', '—')]);
  }
}

function buildTooling(wb: ExcelJS.Workbook, plan: any, nameById: Map<string, string>) {
  const s = wb.addWorksheet('Tooling', { views: [{ showGridLines: false }] });
  sheetHeader(s, 4, 'Tooling', 'GA4 & GTM setup notes');
  const t = plan?.tooling || {};
  const keyEvents = (t.ga4?.keyEvents || []).map((id: string) => nameById.get(id) || id).join(', ');
  let r = 5;
  const meta: Array<[string, string]> = [
    ['GA4 key events', keyEvents || '—'],
    ['GTM suggested tag count', String(t.gtm?.suggestedTagCount ?? '—')],
    ['GTM notes', t.gtm?.notes || '—'],
  ];
  for (const [k, v] of meta) {
    const lc = s.getCell(`A${r}`); lc.value = k; lc.font = { bold: true, size: 10, color: { argb: MUTED } }; lc.alignment = { vertical: 'top' };
    s.mergeCells(`B${r}:D${r}`); const vc = s.getCell(`B${r}`); vc.value = v; vc.font = { size: 10, color: { argb: INK } }; vc.alignment = { vertical: 'top', wrapText: true };
    s.getColumn(1).width = 26; s.getRow(r).height = 22; r++;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function buildPlanWorkbook(plan: any, score: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND;
  wb.created = new Date();

  // id → event name, for friendly cross-references.
  const nameById = new Map<string, string>();
  for (const e of plan?.events || []) if (e?.id) nameById.set(e.id, e.name || e.id);

  buildCover(wb, plan, score);
  buildSummary(wb, plan);
  buildKpis(wb, plan, nameById);
  buildEvents(wb, plan);
  buildParameters(wb, plan);
  buildDataLayer(wb, plan, nameById);
  buildCustomDimensions(wb, plan);
  buildConsent(wb, plan);
  buildTooling(wb, plan, nameById);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
