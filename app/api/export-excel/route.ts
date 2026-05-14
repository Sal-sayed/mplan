import { NextRequest, NextResponse } from 'next/server';
import { generateExcel } from '@/lib/excel-export';

export async function POST(req: NextRequest) {
  try {
    const { plan, score } = await req.json();

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Plan data is required' },
        { status: 400 }
      );
    }

    const excelBuffer = await generateExcel(plan, score);
    const uint8 = new Uint8Array(excelBuffer as ArrayBuffer);

    return new NextResponse(uint8, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="Measurement_Plan.xlsx"',
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate Excel file';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
