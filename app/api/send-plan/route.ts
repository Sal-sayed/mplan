/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { generatePlanExcel } from '@/lib/excel-export';
import { generateAuditExcelFromUpload, generateAuditExcelFromTemplate } from '@/lib/audit-excel-generator';
import { saveLead, updateLeadEmailStatus } from '@/lib/leads-store';
import { sendMeasurementPlanEmail } from '@/lib/email-sender';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  // ─── RATE LIMIT ───
  const clientId = getClientIdentifier(req);
  const rl = await checkRateLimit(clientId);
  if (!rl.allowed) {
    const resetMinutes = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000 / 60));
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. You can submit ${rl.limit} requests per hour. Try again in ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.`,
        rateLimitInfo: { limit: rl.limit, remaining: rl.remaining, resetInMinutes: resetMinutes },
      },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const { email, plan, audit, score, mode = 'new', existingPlanRawBuffer } = await req.json();

    const isAudit = mode === 'audit';
    const planOrAudit = isAudit ? audit : plan;

    if (!email || !planOrAudit) {
      return NextResponse.json({ success: false, error: 'Missing email or plan/audit data' }, { status: 400 });
    }

    // Save lead
    const saveResult = await saveLead({
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

    if (!saveResult.success || !saveResult.lead) {
      // The lead couldn't be captured at all (rare — local write usually succeeds).
      return NextResponse.json(
        { success: false, error: saveResult.error || 'Could not save your submission. Please contact support.' },
        { status: 500 }
      );
    }

    const lead = saveResult.lead;

    // ─── EXCEL ───
    const safeUrl = (planOrAudit.websiteInfo?.url || 'site')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 40);

    let excelBuf: Buffer;
    let filenamePrefix: string;

    if (mode === 'new') {
      excelBuf = await generatePlanExcel(plan, score, 'new');
      filenamePrefix = 'measurement-plan';
    } else if (mode === 'audit' && existingPlanRawBuffer) {
      const uploadedBuffer = Buffer.from(existingPlanRawBuffer, 'base64');
      excelBuf = await generateAuditExcelFromUpload(uploadedBuffer, audit);
      filenamePrefix = 'tracking-audit';
    } else {
      excelBuf = await generateAuditExcelFromTemplate(audit, score);
      filenamePrefix = 'tracking-audit';
    }

    const excelFilename = `${filenamePrefix}-${safeUrl}.xlsx`;
    const websiteName = planOrAudit.websiteInfo?.title || planOrAudit.websiteInfo?.url || 'your website';
    const websiteUrl = planOrAudit.websiteInfo?.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'your website';

    console.log('[send-plan] Excel built:', {
      filename: excelFilename,
      excelKB: +(excelBuf.byteLength / 1024).toFixed(1),
    });

    // ─── EMAIL ───
    const emailResult = await sendMeasurementPlanEmail({
      to: email,
      toName: email.split('@')[0],
      websiteName,
      websiteUrl,
      healthScore: score?.total ?? null,
      healthGrade: score?.grade ?? null,
      excelBuffer: excelBuf,
      excelFilename,
      mode: isAudit ? 'audit' : 'new',
    });

    // Track delivery on the lead record.
    await updateLeadEmailStatus(lead.id, {
      emailSent: emailResult.success,
      emailProvider: emailResult.provider,
      emailMessageId: emailResult.messageId,
      emailError: emailResult.error,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "We couldn't send the email. Your audit is saved — please contact support to recover it.",
          leadId: lead.id,
          provider: emailResult.provider,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      emailProvider: emailResult.provider,
      messageId: emailResult.messageId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    console.error('[send-plan] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
