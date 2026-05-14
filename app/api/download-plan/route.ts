import { NextRequest } from 'next/server';
import { generatePlanPDF } from '@/lib/pdf-generator';
import { generateExcel } from '@/lib/excel-export';
import { generatePlanJSON } from '@/lib/json-generator';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { format, plan, score, scrapeData } = await req.json();
    const safeUrl = (plan.websiteInfo?.url || 'site')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 40);

    let buffer: Buffer | Uint8Array;
    let mimeType: string;
    let extension: string;

    if (format === 'pdf') {
      buffer = await generatePlanPDF(plan, score);
      mimeType = 'application/pdf';
      extension = 'pdf';
    } else if (format === 'excel') {
      const excelBuf = await generateExcel(plan, score);
      buffer = new Uint8Array(excelBuf as ArrayBuffer);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    } else if (format === 'json') {
      buffer = generatePlanJSON(plan, score, scrapeData);
      mimeType = 'application/json';
      extension = 'json';
    } else {
      return new Response('Invalid format. Use: pdf, excel, json', { status: 400 });
    }

    return new Response(new Uint8Array(buffer instanceof Buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="measurement-plan-${safeUrl}.${extension}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Download failed';
    return new Response(message, { status: 500 });
  }
}
