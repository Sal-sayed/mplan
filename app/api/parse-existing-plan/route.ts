import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const parsedPlan: any = {
      filename: file.name,
      sheets: [],
    };

    wb.eachSheet((sheet) => {
      const headers: string[] = [];
      const rows: any[] = [];

      sheet.eachRow((row, rowIdx) => {
        const rowValues: any[] = [];
        row.eachCell({ includeEmpty: false }, (cell) => {
          rowValues.push(cell.value?.toString().trim() || '');
        });

        if (rowIdx === 1) {
          headers.push(...rowValues);
        } else {
          const rowObj: any = {};
          rowValues.forEach((v, i) => {
            const key = headers[i] || `col_${i}`;
            rowObj[key] = v;
          });
          if (Object.keys(rowObj).length > 0) rows.push(rowObj);
        }
      });

      parsedPlan.sheets.push({
        name: sheet.name,
        headers,
        rowCount: rows.length,
        rows: rows.slice(0, 100), // cap at 100 rows per sheet to keep payload small
      });
    });

    // Try to extract events specifically (most common ask)
    const eventNames: string[] = [];
    parsedPlan.sheets.forEach((s: any) => {
      if (/event/i.test(s.name)) {
        s.rows.forEach((row: any) => {
          const eventName = row.eventName || row['Event Name'] || row.event_name || row.name || row.Event || row['Event name'];
          if (eventName) eventNames.push(eventName);
        });
      }
    });
    parsedPlan.detectedEvents = eventNames;

    return NextResponse.json({ success: true, parsedPlan });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse Excel file';
    console.error('Parse error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
