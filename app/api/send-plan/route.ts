/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { generatePlanExcel } from '@/lib/excel-export';
import { generateAuditExcelFromUpload, generateAuditExcelFromTemplate } from '@/lib/audit-excel-generator';
import { saveLead } from '@/lib/leads-store';

export const maxDuration = 90;

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv930949.hstgr.cloud/webhook/017f05f9-fb1d-41c4-b3a4-44f6ebef7252';

export async function POST(req: NextRequest) {
  try {
    const { email, plan, audit, score, scrapeData, mode = 'new', existingPlanRawBuffer } = await req.json();

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

    // ─── THREE EXPORT PATHS ───
    const safeUrl = (planOrAudit.websiteInfo?.url || 'site')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 40);

    let excelBuf: Buffer;
    let filenamePrefix: string;
    let subjectPrefix: string;

    if (mode === 'new') {
      // PATH A: New website → template-based plan
      excelBuf = await generatePlanExcel(plan, score, 'new');
      filenamePrefix = 'measurement-plan';
      subjectPrefix = 'Measurement plan for';
    } else if (mode === 'audit' && existingPlanRawBuffer) {
      // PATH B: Existing + upload → inject audit into user's Excel
      const uploadedBuffer = Buffer.from(existingPlanRawBuffer, 'base64');
      excelBuf = await generateAuditExcelFromUpload(uploadedBuffer, audit);
      filenamePrefix = 'tracking-audit';
      subjectPrefix = 'Tracking audit for';
    } else {
      // PATH C: Existing + no upload → template-based audit
      excelBuf = await generateAuditExcelFromTemplate(audit, score);
      filenamePrefix = 'tracking-audit';
      subjectPrefix = 'Tracking audit for';
    }

    const attachmentBase64 = excelBuf.toString('base64');
    const attachment = {
      filename: `${filenamePrefix}-${safeUrl}.xlsx`,
      content: attachmentBase64,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const excelBytes = excelBuf.byteLength;
    const attachmentBase64Bytes = Buffer.byteLength(attachmentBase64, 'utf8');
    console.log('[send-plan] Excel attachment:', {
      filename: attachment.filename,
      excelBytes,
      excelKB: +(excelBytes / 1024).toFixed(1),
      base64Bytes: attachmentBase64Bytes,
      base64KB: +(attachmentBase64Bytes / 1024).toFixed(1),
    });

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

    const requestStartedAt = Date.now();
    const requestBody = JSON.stringify(webhookPayload);
    console.log('[send-plan] Webhook request →', {
      url: N8N_WEBHOOK_URL,
      to: email,
      subject,
      mode,
      attachmentCount: webhookPayload.attachments.length,
      payloadBytes: Buffer.byteLength(requestBody, 'utf8'),
      payloadKB: +(Buffer.byteLength(requestBody, 'utf8') / 1024).toFixed(1),
    });

    const webhookRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    const responseText = await webhookRes.text().catch(() => '');
    const elapsedMs = Date.now() - requestStartedAt;
    const responsePreview = responseText.length > 1000 ? `${responseText.slice(0, 1000)}…[truncated, ${responseText.length} bytes]` : responseText;

    console.log('[send-plan] Webhook response ←', {
      status: webhookRes.status,
      ok: webhookRes.ok,
      elapsedMs,
      contentType: webhookRes.headers.get('content-type'),
      responseBytes: responseText.length,
      body: responsePreview || '(empty body)',
    });

    if (!webhookRes.ok) {
      throw new Error(`Webhook failed (${webhookRes.status}): ${responseText || 'Unknown error'}`);
    }

    // Try to surface n8n's report so we can tell if it ACTUALLY sent the email
    let webhookData: any = null;
    try { webhookData = responseText ? JSON.parse(responseText) : null; } catch { /* not JSON */ }
    const looksLikeFailure = webhookData && (
      webhookData.success === false ||
      webhookData.status === 'error' ||
      typeof webhookData.error === 'string' ||
      (Array.isArray(webhookData) && webhookData.some((r: any) => r?.error || r?.status === 'error'))
    );
    if (looksLikeFailure) {
      console.warn('[send-plan] Webhook returned 2xx but body suggests downstream failure:', webhookData);
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      webhook: {
        status: webhookRes.status,
        elapsedMs,
        body: webhookData ?? responsePreview,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    console.error('Send plan error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
