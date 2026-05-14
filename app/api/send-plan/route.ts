/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { generateExcel } from '@/lib/excel-export';
import { generateAuditExcel } from '@/lib/audit-excel-generator';
import { saveLead } from '@/lib/leads-store';

export const maxDuration = 90;

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv930949.hstgr.cloud/webhook/017f05f9-fb1d-41c4-b3a4-44f6ebef7252';

export async function POST(req: NextRequest) {
  try {
    const { email, plan, audit, score, scrapeData, mode = 'new' } = await req.json();

    const isAudit = mode === 'audit';
    const planOrAudit = isAudit ? audit : plan;

    if (!email || !planOrAudit) {
      return NextResponse.json({ success: false, error: 'Missing email or plan/audit data' }, { status: 400 });
    }

    // Save lead
    const lead = await saveLead({
      email,
      mode,
      website_url: planOrAudit.websiteInfo?.url || '',
      website_title: planOrAudit.websiteInfo?.title || '',
      industry: planOrAudit.websiteInfo?.industry || '',
      business_type: planOrAudit.websiteInfo?.businessType || '',
      health_score: score?.total || null,
      health_grade: score?.grade || null,
      plan_summary: isAudit
        ? {
            eventsToAdd: audit?.eventsToAdd?.length || 0,
            eventsToModify: audit?.eventsToModify?.length || 0,
            quickWins: audit?.quickWins?.length || 0,
          }
        : {
            objectives: plan?.businessObjectives?.length || 0,
            kpis: plan?.kpis?.length || 0,
            events: plan?.events?.length || 0,
          },
    });

    // Generate Excel
    const safeUrl = (planOrAudit.websiteInfo?.url || 'site')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 40);

    let excelBuf: Buffer;
    let filenamePrefix: string;
    let subjectPrefix: string;

    if (isAudit) {
      excelBuf = await generateAuditExcel(audit, score);
      filenamePrefix = 'tracking-audit';
      subjectPrefix = 'Tracking audit for';
    } else {
      const rawBuf = await generateExcel(plan, score);
      excelBuf = Buffer.from(rawBuf as ArrayBuffer);
      filenamePrefix = 'measurement-plan';
      subjectPrefix = 'Measurement plan for';
    }

    const attachment = {
      filename: `${filenamePrefix}-${safeUrl}.xlsx`,
      content: excelBuf.toString('base64'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const websiteUrl = planOrAudit.websiteInfo?.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'your website';
    const subject = `${subjectPrefix} ${websiteUrl}`;

    // Send to n8n webhook
    const webhookPayload = {
      to: email,
      name: email.split('@')[0],
      subject,
      mode,
      websiteUrl: planOrAudit.websiteInfo?.url || '',
      websiteTitle: planOrAudit.websiteInfo?.title || '',
      businessType: planOrAudit.websiteInfo?.businessType || '',
      industry: planOrAudit.websiteInfo?.industry || '',
      eventsCount: isAudit ? (audit?.eventsToAdd?.length || 0) : (plan?.events?.length || 0),
      kpisCount: isAudit ? (audit?.eventsToModify?.length || 0) : (plan?.kpis?.length || 0),
      healthScore: score?.total || 0,
      healthGrade: score?.grade || 'N/A',
      formatsRequested: ['Excel workbook'],
      attachments: [attachment],
      leadId: lead.id,
    };

    const webhookRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookRes.ok) {
      const errText = await webhookRes.text().catch(() => 'Unknown error');
      throw new Error(`Webhook failed (${webhookRes.status}): ${errText}`);
    }

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    console.error('Send plan error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
