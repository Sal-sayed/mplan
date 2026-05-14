/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from 'exceljs';

export async function generateAuditExcel(audit: any, score: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web Analytics Measurement Plan Agent';
  wb.created = new Date();

  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE85D3A' } };
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  const BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFE5E7EB' } };

  const styleHeader = (row: ExcelJS.Row) => {
    row.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    });
    row.height = 28;
  };

  const styleDataRows = (sheet: ExcelJS.Worksheet) => {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        });
      }
    });
  };

  // ── Sheet 1: Summary ──
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ header: 'Item', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 70 }];
  styleHeader(summary.getRow(1));
  summary.addRow({ k: 'Website', v: audit.websiteInfo?.url });
  summary.addRow({ k: 'Business type', v: audit.websiteInfo?.businessType });
  summary.addRow({ k: 'Industry', v: audit.websiteInfo?.industry });
  summary.addRow({ k: 'Current health score', v: `${score?.total || 0}/100` });
  summary.addRow({ k: 'Events currently firing', v: (audit.currentState?.eventsCurrentlyFiring || []).length });
  summary.addRow({ k: 'Events to add', v: (audit.eventsToAdd || []).length });
  summary.addRow({ k: 'Events to modify', v: (audit.eventsToModify || []).length });
  summary.addRow({ k: 'Events to remove', v: (audit.eventsToRemove || []).length });
  summary.addRow({ k: 'Quick wins', v: (audit.quickWins || []).length });
  summary.addRow({ k: '', v: '' });
  summary.addRow({ k: 'Executive summary', v: audit.executiveSummary });
  styleDataRows(summary);

  // ── Sheet 2: Current State ──
  const current = wb.addWorksheet('Current State');
  current.columns = [
    { header: 'Section', key: 's', width: 25 },
    { header: 'Detail', key: 'd', width: 70 },
  ];
  styleHeader(current.getRow(1));
  current.addRow({ s: 'Summary', d: audit.currentState?.summary });
  current.addRow({ s: 'Events firing now', d: (audit.currentState?.eventsCurrentlyFiring || []).join(', ') });
  if (audit.currentState?.documentedButNotFiring?.length) {
    current.addRow({ s: 'In plan but NOT firing', d: audit.currentState.documentedButNotFiring.join(', ') });
  }
  current.addRow({ s: 'Critical issues', d: (audit.currentState?.criticalIssues || []).join('\n') });
  styleDataRows(current);

  // ── Sheet 3: Events to Add (the main output) ──
  const toAdd = wb.addWorksheet('Events to Add');
  toAdd.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Event name', key: 'name', width: 28 },
    { header: 'Category', key: 'cat', width: 16 },
    { header: 'Trigger', key: 'trig', width: 40 },
    { header: 'Parameters', key: 'p', width: 35 },
    { header: 'Why it matters', key: 'r', width: 35 },
    { header: 'Priority', key: 'pri', width: 12 },
    { header: 'Impact', key: 'i', width: 30 },
  ];
  styleHeader(toAdd.getRow(1));
  (audit.eventsToAdd || []).forEach((e: any) =>
    toAdd.addRow({
      id: e.id, name: e.eventName, cat: e.category, trig: e.trigger,
      p: (e.parameters || []).map((p: any) => `${p.name} (${p.type})`).join(', '),
      r: e.rationale, pri: e.priority, i: e.estimatedImpact,
    })
  );
  // Color-code priority
  toAdd.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      });
      const priCell = row.getCell('pri');
      const pri = String(priCell.value || '').toLowerCase();
      if (pri === 'critical') {
        priCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      } else if (pri === 'high') {
        priCell.font = { bold: true, color: { argb: 'FFEA580C' } };
      }
    }
  });

  // ── Sheet 4: Events to Modify ──
  if ((audit.eventsToModify || []).length) {
    const toMod = wb.addWorksheet('Events to Modify');
    toMod.columns = [
      { header: 'Current name', key: 'now', width: 25 },
      { header: 'Recommended', key: 'rec', width: 25 },
      { header: 'Issue', key: 'issue', width: 40 },
      { header: 'Fix', key: 'fix', width: 40 },
    ];
    styleHeader(toMod.getRow(1));
    audit.eventsToModify.forEach((e: any) =>
      toMod.addRow({ now: e.currentName, rec: e.recommendedName, issue: e.currentIssue, fix: e.fix })
    );
    styleDataRows(toMod);
  }

  // ── Sheet 5: Events to Remove ──
  if ((audit.eventsToRemove || []).length) {
    const toRm = wb.addWorksheet('Events to Remove');
    toRm.columns = [
      { header: 'Event name', key: 'name', width: 25 },
      { header: 'Reason', key: 'r', width: 50 },
    ];
    styleHeader(toRm.getRow(1));
    audit.eventsToRemove.forEach((e: any) => toRm.addRow({ name: e.eventName, r: e.reason }));
    styleDataRows(toRm);
  }

  // ── Sheet 6: Quick Wins ──
  const wins = wb.addWorksheet('Quick Wins');
  wins.columns = [
    { header: 'Action', key: 'a', width: 40 },
    { header: 'Impact', key: 'i', width: 40 },
    { header: 'Time', key: 't', width: 15 },
    { header: 'Difficulty', key: 'd', width: 12 },
  ];
  styleHeader(wins.getRow(1));
  (audit.quickWins || []).forEach((w: any) =>
    wins.addRow({ a: w.action, i: w.impact, t: w.timeRequired, d: w.difficulty })
  );
  styleDataRows(wins);

  // ── Sheet 7: New Dimensions ──
  if ((audit.newDimensions || []).length) {
    const dim = wb.addWorksheet('New Dimensions');
    dim.columns = [
      { header: 'Name', key: 'n', width: 28 },
      { header: 'Scope', key: 's', width: 14 },
      { header: 'Description', key: 'd', width: 45 },
      { header: 'Rationale', key: 'r', width: 40 },
    ];
    styleHeader(dim.getRow(1));
    audit.newDimensions.forEach((d: any) =>
      dim.addRow({ n: d.name, s: d.scope, d: d.description, r: d.rationale })
    );
    styleDataRows(dim);
  }

  // ── Sheet 8: Roadmap ──
  const road = wb.addWorksheet('Roadmap');
  road.columns = [
    { header: 'Phase', key: 'p', width: 8 },
    { header: 'Name', key: 'n', width: 25 },
    { header: 'Duration', key: 'd', width: 15 },
    { header: 'Events', key: 'e', width: 30 },
    { header: 'Rationale', key: 'r', width: 50 },
  ];
  styleHeader(road.getRow(1));
  (audit.implementationPriority || []).forEach((p: any) =>
    road.addRow({ p: p.phase, n: p.name, d: p.duration, e: (p.events || []).join(', '), r: p.rationale })
  );
  styleDataRows(road);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
