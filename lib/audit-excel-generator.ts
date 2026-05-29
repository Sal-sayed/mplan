/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';

// ═══════════════════════════════════════════
// STYLE EXTRACTION — reads user's template colors
// ═══════════════════════════════════════════

interface UserStyle {
  headerFill: ExcelJS.Fill;
  headerFont: Partial<ExcelJS.Font>;
  headerBorder: Partial<ExcelJS.Borders>;
  headerRowHeight: number;
}

const DEFAULT_STYLE: UserStyle = {
  headerFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } },
  headerFont: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  headerBorder: {
    top: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    left: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    right: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  },
  headerRowHeight: 28,
};

function extractUserStyle(wb: ExcelJS.Workbook): UserStyle {
  try {
    for (const sheet of wb.worksheets) {
      for (let r = 1; r <= 6; r++) {
        const row = sheet.getRow(r);
        const cell = row.getCell(1);
        if (cell.font?.bold && cell.fill?.type === 'pattern') {
          const style: UserStyle = {
            headerFill: JSON.parse(JSON.stringify(cell.fill)),
            headerFont: JSON.parse(JSON.stringify(cell.font)),
            headerBorder: cell.border ? JSON.parse(JSON.stringify(cell.border)) : DEFAULT_STYLE.headerBorder,
            headerRowHeight: row.height || 28,
          };
          console.log('Detected user template style:', {
            fillColor: (style.headerFill as any)?.fgColor?.argb,
            fontColor: style.headerFont?.color,
          });
          return style;
        }
      }
    }
  } catch (e) { console.log('Could not extract template style:', e); }
  return DEFAULT_STYLE;
}

function getTabColor(style: UserStyle): { argb: string } {
  const fill = style.headerFill as any;
  return fill?.fgColor?.argb ? { argb: fill.fgColor.argb } : { argb: 'FF1E3A5F' };
}

// ═══════════════════════════════════════════
// SHEET FINDING — match user sheets by keywords
// ═══════════════════════════════════════════

function findSheet(wb: ExcelJS.Workbook, keywords: string[]): ExcelJS.Worksheet | null {
  for (const sheet of wb.worksheets) {
    const name = sheet.name.toLowerCase();
    for (const kw of keywords) {
      if (name.includes(kw.toLowerCase())) return sheet;
    }
  }
  return null;
}

// ═══════════════════════════════════════════
// STYLE HELPERS — apply user's style to new content
// ═══════════════════════════════════════════

function styleHeaderRow(row: ExcelJS.Row, style: UserStyle) {
  row.eachCell(cell => {
    cell.fill = style.headerFill;
    cell.font = style.headerFont;
    cell.border = style.headerBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = style.headerRowHeight;
}

function addSectionHeader(sheet: ExcelJS.Worksheet, row: number, text: string, colSpan: number, style: UserStyle) {
  if (colSpan > 1) sheet.mergeCells(row, 1, row, colSpan);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.fill = style.headerFill;
  cell.font = style.headerFont;
  cell.alignment = { vertical: 'middle' };
  sheet.getRow(row).height = style.headerRowHeight;
}

function addColumnHeaders(sheet: ExcelJS.Worksheet, row: number, headers: string[], style: UserStyle) {
  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h;
    cell.fill = style.headerFill;
    cell.font = style.headerFont;
    cell.border = style.headerBorder;
  });
  sheet.getRow(row).height = style.headerRowHeight;
}

// ═══════════════════════════════════════════
// POPULATE INTO EXISTING USER SHEETS
// ═══════════════════════════════════════════

function populateUserOverview(wb: ExcelJS.Workbook, audit: any, style: UserStyle): boolean {
  const sheet = findSheet(wb, ['overview', 'summary', 'executive', 'introduction']);
  if (!sheet) return false;
  console.log(`Populating user's "${sheet.name}" with audit summary`);
  const start = (sheet.lastRow?.number || 1) + 2;
  addSectionHeader(sheet, start, 'AUDIT FINDINGS — EXECUTIVE SUMMARY', 6, style);
  sheet.mergeCells(start + 1, 1, start + 1, 6);
  sheet.getCell(start + 1, 1).value = audit.executiveSummary || 'Audit completed';
  sheet.getCell(start + 1, 1).alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(start + 1).height = 60;
  if (audit.criticalIssues?.length) {
    addSectionHeader(sheet, start + 3, 'CRITICAL ISSUES', 6, style);
    audit.criticalIssues.forEach((issue: string, i: number) => {
      const r = start + 4 + i;
      sheet.getCell(r, 1).value = i + 1;
      sheet.getCell(r, 1).font = { bold: true };
      sheet.mergeCells(r, 2, r, 6);
      sheet.getCell(r, 2).value = issue;
      sheet.getCell(r, 2).alignment = { wrapText: true };
    });
  }
  return true;
}

function populateUserEvents(wb: ExcelJS.Workbook, audit: any, style: UserStyle): boolean {
  const sheet = findSheet(wb, ['events', 'tracking', 'event list', 'tags', 'tracking plan']);
  if (!sheet) return false;
  console.log(`Populating user's "${sheet.name}" with events to add`);
  const start = (sheet.lastRow?.number || 1) + 2;
  addSectionHeader(sheet, start, 'AUDIT FINDINGS — EVENTS TO ADD', 6, style);
  addColumnHeaders(sheet, start + 1, ['ID', 'Event Name', 'Trigger', 'Parameters', 'Priority', 'Rationale'], style);
  (audit.eventsToAdd || []).forEach((evt: any, i: number) => {
    const r = start + 2 + i;
    sheet.getCell(r, 1).value = evt.id || `ADD${i + 1}`;
    sheet.getCell(r, 2).value = evt.eventName || evt.name;
    sheet.getCell(r, 3).value = evt.trigger;
    sheet.getCell(r, 4).value = Array.isArray(evt.parameters) ? evt.parameters.map((p: any) => p.name || p).join(', ') : (evt.parameters || '');
    sheet.getCell(r, 5).value = evt.priority || 'Medium';
    sheet.getCell(r, 6).value = evt.rationale || '';
  });
  return true;
}

function populateUserSetup(wb: ExcelJS.Workbook, audit: any, style: UserStyle): boolean {
  const sheet = findSheet(wb, ['setup', 'gtm', 'tracking stack', 'ga4', 'installation', 'detected']);
  if (!sheet) return false;
  console.log(`Populating user's "${sheet.name}" with detected setup`);
  const start = (sheet.lastRow?.number || 1) + 2;
  addSectionHeader(sheet, start, 'AUDIT FINDINGS — DETECTED TRACKING SETUP', 3, style);
  addColumnHeaders(sheet, start + 1, ['Tool', 'Detected IDs', 'Status'], style);
  const setup = audit.detectedSetup || {};
  const rows = [
    { tool: 'Google Analytics 4', ids: (setup.ga4?.measurementIds || []).join(', '), status: setup.ga4?.installed ? 'Active' : 'Not installed' },
    { tool: 'Google Tag Manager', ids: (setup.gtm?.containerIds || []).join(', '), status: setup.gtm?.installed ? 'Active' : 'Not installed' },
    { tool: 'Universal Analytics', ids: (setup.universalAnalytics?.propertyIds || []).join(', '), status: setup.universalAnalytics?.installed ? 'DEPRECATED' : 'Not installed' },
    { tool: 'Meta Pixel', ids: (setup.metaPixel?.ids || []).join(', '), status: setup.metaPixel?.installed ? 'Active' : 'Not installed' },
  ].filter(r => r.ids || r.status !== 'Not installed');
  rows.forEach((r, i) => {
    const row = start + 2 + i;
    sheet.getCell(row, 1).value = r.tool;
    sheet.getCell(row, 2).value = r.ids;
    sheet.getCell(row, 3).value = r.status;
  });
  return true;
}

// ═══════════════════════════════════════════
// ADD NEW SHEETS IN USER'S STYLE
// ═══════════════════════════════════════════

function addEventsSheet(wb: ExcelJS.Workbook, events: any[], style: UserStyle) {
  const sheet = wb.addWorksheet('Events to Add', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 8 }, { width: 28 }, { width: 35 }, { width: 35 }, { width: 12 }, { width: 40 }];
  addColumnHeaders(sheet, 1, ['ID', 'Event Name', 'Trigger', 'Parameters', 'Priority', 'Rationale'], style);
  events.forEach((evt: any, i: number) => {
    const r = i + 2;
    sheet.getCell(r, 1).value = evt.id || `ADD${i + 1}`;
    sheet.getCell(r, 2).value = evt.eventName || evt.name;
    sheet.getCell(r, 3).value = evt.trigger;
    sheet.getCell(r, 4).value = Array.isArray(evt.parameters) ? evt.parameters.map((p: any) => p.name || p).join(', ') : (evt.parameters || '');
    sheet.getCell(r, 5).value = evt.priority || 'Medium';
    sheet.getCell(r, 6).value = evt.rationale || '';
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addSummarySheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const sheet = wb.addWorksheet('Audit Summary', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 35 }, { width: 80 }];
  addColumnHeaders(sheet, 1, ['Item', 'Detail'], style);
  const rows = [
    ['Website', audit.websiteInfo?.url],
    ['Industry', audit.websiteInfo?.industry],
    ['Business Type', audit.websiteInfo?.businessType],
    ['Events Currently Firing', (audit.currentlyFiringEvents || []).length],
    ['Events to Add', (audit.eventsToAdd || []).length],
    ['Events to Fix', (audit.eventsToFix || []).length],
    ['Quick Wins', (audit.quickWins || []).length],
    ['', ''],
    ['Executive Summary', audit.executiveSummary],
  ];
  if (audit.criticalIssues?.length) {
    rows.push(['', ''], ['Critical Issues', audit.criticalIssues.join('\n')]);
  }
  rows.forEach((r, i) => { sheet.getCell(i + 2, 1).value = r[0]; sheet.getCell(i + 2, 2).value = r[1]; });
}

function addSetupSheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const sheet = wb.addWorksheet('Detected Setup', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 28 }, { width: 45 }, { width: 22 }];
  addColumnHeaders(sheet, 1, ['Tool', 'Detected IDs', 'Status'], style);
  const setup = audit.detectedSetup || {};
  const rows = [
    setup.ga4?.measurementIds?.length && { tool: 'Google Analytics 4', ids: setup.ga4.measurementIds.join(', '), status: setup.ga4.status || 'Active' },
    setup.gtm?.containerIds?.length && { tool: 'Google Tag Manager', ids: setup.gtm.containerIds.join(', '), status: 'Active' },
    setup.universalAnalytics?.propertyIds?.length && { tool: 'Universal Analytics', ids: setup.universalAnalytics.propertyIds.join(', '), status: 'DEPRECATED' },
    setup.metaPixel?.ids?.length && { tool: 'Meta Pixel', ids: setup.metaPixel.ids.join(', '), status: 'Active' },
    setup.googleAds?.ids?.length && { tool: 'Google Ads', ids: setup.googleAds.ids.join(', '), status: 'Active' },
  ].filter(Boolean);
  rows.forEach((r: any, i: number) => {
    sheet.getCell(i + 2, 1).value = r.tool; sheet.getCell(i + 2, 2).value = r.ids; sheet.getCell(i + 2, 3).value = r.status;
  });
  const cd = audit.consentDetection || audit.detectedSetup?.consentMode || {};
  const gapRow = rows.length + 3;
  sheet.getCell(gapRow, 1).value = 'Consent Mode'; sheet.getCell(gapRow, 2).value = cd.cmpDetected || cd.cmp || 'None'; sheet.getCell(gapRow, 3).value = cd.enabled ? 'Active' : 'NOT INTEGRATED';
}

function addFiringEventsSheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const events = audit.currentlyFiringEvents || [];
  if (events.length === 0) return;
  const sheet = wb.addWorksheet('Currently Firing Events', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 28 }, { width: 22 }, { width: 12 }, { width: 10 }, { width: 45 }];
  addColumnHeaders(sheet, 1, ['Event Name', 'Source', 'Type', 'In Plan?', 'Notes'], style);
  events.forEach((e: any, i: number) => {
    const r = i + 2;
    sheet.getCell(r, 1).value = typeof e === 'string' ? e : e.eventName;
    sheet.getCell(r, 2).value = typeof e === 'string' ? 'Detected' : (e.source || '');
    sheet.getCell(r, 3).value = e.isStandard ? 'Standard' : 'Custom';
    sheet.getCell(r, 4).value = e.isDocumented === true ? 'Yes' : e.isDocumented === false ? 'No' : '-';
    sheet.getCell(r, 5).value = e.notes || '';
  });
}

function addFixSheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const fixes = audit.eventsToFix || [];
  if (fixes.length === 0) return;
  const sheet = wb.addWorksheet('Events to Fix', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [
    { width: 25 }, // Current Name
    { width: 25 }, // Recommended Name
    { width: 14 }, // Type
    { width: 16 }, // Detection
    { width: 12 }, // Priority
    { width: 40 }, // Issue
    { width: 40 }, // Fix
  ];
  addColumnHeaders(sheet, 1, ['Current Name', 'Recommended Name', 'Type', 'Detection', 'Priority', 'Issue', 'Fix'], style);
  fixes.forEach((e: any, i: number) => {
    const r = i + 2;
    sheet.getCell(r, 1).value = e.currentName;
    sheet.getCell(r, 2).value = e.recommendedName || '—';
    sheet.getCell(r, 3).value = e.fixType;
    sheet.getCell(r, 4).value =
      e.detectionMethod === 'normalized-match' ? 'Auto-detected' :
      e.detectionMethod === 'keyword-match' ? 'Keyword match' :
      e.detectionMethod === 'ai-check' ? 'AI verified' :
      e.detectionMethod ? 'Detected' : '—';
    sheet.getCell(r, 5).value = e.priority || '—';
    sheet.getCell(r, 6).value = e.currentIssue;
    sheet.getCell(r, 6).alignment = { wrapText: true, vertical: 'top' };
    sheet.getCell(r, 7).value = e.recommendedFix;
    sheet.getCell(r, 7).alignment = { wrapText: true, vertical: 'top' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addQuickWinsSheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const wins = audit.quickWins || [];
  if (wins.length === 0) return;
  const sheet = wb.addWorksheet('Quick Wins', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 50 }, { width: 40 }, { width: 15 }, { width: 15 }];
  addColumnHeaders(sheet, 1, ['Action', 'Impact', 'Time', 'Difficulty'], style);
  wins.forEach((w: any, i: number) => {
    const r = i + 2;
    sheet.getCell(r, 1).value = w.action; sheet.getCell(r, 2).value = w.impact;
    sheet.getCell(r, 3).value = w.timeRequired; sheet.getCell(r, 4).value = w.difficulty;
  });
}

function addRoadmapSheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const roadmap = audit.implementationRoadmap || audit.implementationPriority || [];
  if (roadmap.length === 0) return;
  const sheet = wb.addWorksheet('Roadmap', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 8 }, { width: 28 }, { width: 15 }, { width: 60 }, { width: 40 }];
  addColumnHeaders(sheet, 1, ['Phase', 'Name', 'Duration', 'Tasks', 'Rationale'], style);
  roadmap.forEach((p: any, i: number) => {
    const r = i + 2;
    sheet.getCell(r, 1).value = p.phase || i + 1; sheet.getCell(r, 2).value = p.name; sheet.getCell(r, 3).value = p.duration;
    sheet.getCell(r, 4).value = (p.tasks || p.events || []).join('\n'); sheet.getCell(r, 4).alignment = { wrapText: true, vertical: 'top' };
    sheet.getCell(r, 5).value = p.rationale;
  });
}

// ═══════════════════════════════════════════
// EVENT CATEGORIES — 3 sheets (firing now / configured-not-firing / missing)
// Matches the 3-section view in AuditResultsScreen so the report is consistent
// between the in-app UI and the exported Excel.
// ═══════════════════════════════════════════

function addEventCategoriesSheets(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const bucket = audit.eventAudit || {};
  const firingEvents = bucket.firingEvents || [];
  const configuredEvents = bucket.configuredEvents || [];
  const missingEvents = audit.missingEvents || [];

  // SHEET 1: Events Firing Now
  if (firingEvents.length > 0) {
    const firingSheet = wb.addWorksheet('Events Firing Now', { properties: { tabColor: { argb: 'FF10B981' } } });
    firingSheet.columns = [{ width: 32 }, { width: 22 }, { width: 28 }, { width: 28 }, { width: 16 }, { width: 50 }];
    addColumnHeaders(firingSheet, 1, ['Event Name', 'Vendor / Source', 'Detection', 'Captured On', 'Transport', 'Parameters'], style);
    firingEvents.forEach((evt: any, i: number) => {
      const r = i + 2;
      firingSheet.getCell(r, 1).value = evt.eventName;
      firingSheet.getCell(r, 2).value = evt.source || evt.vendor || '';
      firingSheet.getCell(r, 3).value = evt.confidenceSource || 'Tracking Spy';
      firingSheet.getCell(r, 4).value = Array.isArray(evt.capturedFromPages) && evt.capturedFromPages.length > 0
        ? evt.capturedFromPages.join(', ')
        : 'homepage';
      firingSheet.getCell(r, 5).value = evt.transport || '';
      const params = evt.parameters && typeof evt.parameters === 'object'
        ? Object.entries(evt.parameters).slice(0, 10).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}`).join('; ')
        : '';
      firingSheet.getCell(r, 6).value = params;
    });
    firingSheet.views = [{ state: 'frozen', ySplit: 1 }];
    firingSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: firingSheet.rowCount, column: firingSheet.columns.length } };
  }

  // SHEET 2: Events Configured (but not firing)
  if (configuredEvents.length > 0) {
    const configSheet = wb.addWorksheet('Events Configured', { properties: { tabColor: { argb: 'FF1E40AF' } } });
    configSheet.columns = [{ width: 32 }, { width: 22 }, { width: 22 }, { width: 35 }, { width: 22 }];
    addColumnHeaders(configSheet, 1, ['Event Name', 'GTM Container', 'Tag Type', 'Trigger', 'Status'], style);
    configuredEvents.forEach((evt: any, i: number) => {
      const r = i + 2;
      configSheet.getCell(r, 1).value = evt.eventName;
      configSheet.getCell(r, 2).value = evt.gtmContainer || '—';
      configSheet.getCell(r, 3).value = evt.tagType || evt.source || '—';
      configSheet.getCell(r, 4).value = evt.trigger || 'Requires user interaction';
      configSheet.getCell(r, 5).value = 'Configured (not fired)';
    });
    configSheet.views = [{ state: 'frozen', ySplit: 1 }];
    configSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: configSheet.rowCount, column: configSheet.columns.length } };
  }

  // SHEET 3: Missing — Should Be Added
  if (missingEvents.length > 0) {
    const missingSheet = wb.addWorksheet('Missing - Should Be Added', { properties: { tabColor: { argb: 'FFF59E0B' } } });
    missingSheet.columns = [{ width: 10 }, { width: 28 }, { width: 16 }, { width: 50 }, { width: 38 }, { width: 38 }, { width: 14 }, { width: 40 }, { width: 18 }];
    addColumnHeaders(missingSheet, 1, ['ID', 'Event Name', 'Category', 'Why Missing', 'Recommended Trigger', 'Parameters', 'Priority', 'Impact', 'Effort'], style);
    missingEvents.forEach((evt: any, i: number) => {
      const r = i + 2;
      missingSheet.getCell(r, 1).value = evt.id || `MISS_${i + 1}`;
      missingSheet.getCell(r, 2).value = evt.eventName;
      missingSheet.getCell(r, 3).value = evt.category;
      missingSheet.getCell(r, 4).value = evt.whyMissing;
      missingSheet.getCell(r, 4).alignment = { wrapText: true, vertical: 'top' };
      missingSheet.getCell(r, 5).value = evt.recommendedTrigger;
      missingSheet.getCell(r, 5).alignment = { wrapText: true, vertical: 'top' };
      missingSheet.getCell(r, 6).value = Array.isArray(evt.parameters)
        ? evt.parameters.map((p: any) => `${p.name}${p.type ? ` (${p.type})` : ''}${p.required ? '*' : ''}`).join(', ')
        : '';
      missingSheet.getCell(r, 7).value = evt.priority || 'Medium';
      missingSheet.getCell(r, 8).value = evt.estimatedImpact;
      missingSheet.getCell(r, 8).alignment = { wrapText: true, vertical: 'top' };
      missingSheet.getCell(r, 9).value = evt.implementationEffort;
    });
    missingSheet.views = [{ state: 'frozen', ySplit: 1 }];
    missingSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: missingSheet.rowCount, column: missingSheet.columns.length } };
  }
}

function addPlanVsRealitySheet(wb: ExcelJS.Workbook, audit: any, style: UserStyle) {
  const pvr = audit.planVsReality;
  if (!pvr) return;
  const hasData = (pvr.documentedButNotFiring || []).length || (pvr.firingButNotDocumented || []).length || (pvr.namingInconsistencies || []).length;
  if (!hasData) return;
  const sheet = wb.addWorksheet('Plan vs Reality', { properties: { tabColor: getTabColor(style) } });
  sheet.columns = [{ width: 22 }, { width: 28 }, { width: 50 }, { width: 12 }];
  addColumnHeaders(sheet, 1, ['Category', 'Event Name', 'Detail', 'Severity'], style);
  let r = 2;
  (pvr.documentedButNotFiring || []).forEach((e: any) => {
    sheet.getCell(r, 1).value = 'In plan but NOT firing'; sheet.getCell(r, 2).value = e.eventName;
    sheet.getCell(r, 3).value = e.businessImpact; sheet.getCell(r, 4).value = e.severity; r++;
  });
  (pvr.firingButNotDocumented || []).forEach((e: any) => {
    sheet.getCell(r, 1).value = 'Firing but NOT in plan'; sheet.getCell(r, 2).value = e.eventName;
    sheet.getCell(r, 3).value = e.recommendation; sheet.getCell(r, 4).value = 'Medium'; r++;
  });
  (pvr.namingInconsistencies || []).forEach((e: any) => {
    sheet.getCell(r, 1).value = 'Naming mismatch'; sheet.getCell(r, 2).value = `${e.planName} → ${e.liveName}`;
    sheet.getCell(r, 3).value = e.fix; sheet.getCell(r, 4).value = 'Low'; r++;
  });
}

// ═══════════════════════════════════════════
// EXPORTED GENERATORS
// ═══════════════════════════════════════════

/**
 * PATH B: User uploaded their Excel → inject audit into it using THEIR style.
 * First tries to populate into matching existing sheets, then adds new sheets in user's style.
 */
export async function generateAuditExcelFromUpload(uploadedBuffer: Buffer, audit: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ab = new ArrayBuffer(uploadedBuffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < uploadedBuffer.length; i++) view[i] = uploadedBuffer[i];
  await wb.xlsx.load(ab);

  const style = extractUserStyle(wb);

  // Try to populate INTO existing user sheets
  const populated = {
    overview: populateUserOverview(wb, audit, style),
    events: populateUserEvents(wb, audit, style),
    setup: populateUserSetup(wb, audit, style),
  };
  console.log('Populated user sheets:', populated);

  // Add new sheets for anything that didn't have a match — all in user's style
  if (!populated.overview) addSummarySheet(wb, audit, style);
  if (!populated.events) addEventsSheet(wb, (audit.eventsToAdd || []), style);
  if (!populated.setup) addSetupSheet(wb, audit, style);

  addFiringEventsSheet(wb, audit, style);
  addEventCategoriesSheets(wb, audit, style);
  addFixSheet(wb, audit, style);
  addPlanVsRealitySheet(wb, audit, style);
  addQuickWinsSheet(wb, audit, style);
  addRoadmapSheet(wb, audit, style);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * PATH C: No upload → standalone audit Excel WITH Dashboard.
 */
export async function generateAuditExcelFromTemplate(audit: any, score: any): Promise<Buffer> {
  const { createDashboardSheet } = await import('./excel-export');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web Analytics Measurement Plan Agent';
  wb.created = new Date();

  const style = DEFAULT_STYLE;

  addSummarySheet(wb, audit, style);
  addSetupSheet(wb, audit, style);
  addFiringEventsSheet(wb, audit, style);
  addEventCategoriesSheets(wb, audit, style);
  addPlanVsRealitySheet(wb, audit, style);
  addEventsSheet(wb, (audit.eventsToAdd || []), style);
  addFixSheet(wb, audit, style);
  addQuickWinsSheet(wb, audit, style);
  addRoadmapSheet(wb, audit, style);

  createDashboardSheet(wb, { websiteInfo: audit.websiteInfo, score, audit }, 'audit');

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Legacy export */
export async function generateAuditExcel(audit: any, score: any): Promise<Buffer> {
  return generateAuditExcelFromTemplate(audit, score);
}
