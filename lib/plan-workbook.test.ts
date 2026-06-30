/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildPlanWorkbook } from './plan-workbook.ts';
import { buildPlanFromTemplate } from './measurement/template-plan.ts';

const EXPECTED_SHEETS = ['Cover', 'Summary', 'KPIs', 'Events', 'Event parameters', 'Data layer', 'Custom dimensions', 'Consent', 'Tooling'];

test('buildPlanWorkbook produces a non-empty xlsx with all expected sheets', async () => {
  const plan = buildPlanFromTemplate('ecommerce', { mode: 'new', url: 'https://shop.example' }, '2026-01-01T00:00:00Z');
  const buf = await buildPlanWorkbook(plan, { total: 82 });
  assert.ok(buf.length > 2000, 'workbook should be a real, non-trivial file');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const names = wb.worksheets.map((w) => w.name);
  for (const s of EXPECTED_SHEETS) assert.ok(names.includes(s), `missing sheet: ${s}`);
});

test('the Events sheet lists the plan events (with a header row)', async () => {
  const plan = buildPlanFromTemplate('saas', { mode: 'new', url: 'https://app.example' }, '2026-01-01T00:00:00Z');
  const buf = await buildPlanWorkbook(plan, null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const events = wb.getWorksheet('Events')!;
  // header at row 5, data from row 6 — at least page_view + the template's events.
  const dataRows = events.rowCount - 5;
  assert.ok(dataRows >= plan.events.length, `Events sheet should have a row per event (${dataRows} vs ${plan.events.length})`);
  assert.equal(events.getCell('B5').value, 'Event name');
});

test('does not throw on a sparse/empty plan (graceful)', async () => {
  const buf = await buildPlanWorkbook({ meta: { url: 'https://x' }, events: [], kpis: [], dataLayer: [] }, null);
  assert.ok(buf.length > 1000);
});
