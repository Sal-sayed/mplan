/* eslint-disable @typescript-eslint/no-explicit-any */
import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export interface EmailParams {
  to: string;
  toName?: string;
  websiteName: string;
  websiteUrl: string;
  healthScore?: number | null;
  healthGrade?: string | null;
  excelBuffer: Buffer;
  excelFilename: string;
  mode: 'new' | 'audit';
}

export interface EmailResult {
  success: boolean;
  provider: 'resend' | 'n8n' | 'failed';
  messageId?: string;
  error?: string;
}

export async function sendMeasurementPlanEmail(params: EmailParams): Promise<EmailResult> {
  const resend = getResend();
  if (resend) {
    try {
      const result = await sendViaResend(resend, params);
      console.log('[email] ✓ sent via Resend:', result.messageId);
      return { success: true, provider: 'resend', messageId: result.messageId };
    } catch (err) {
      const msg = (err as Error)?.message || 'Resend failed';
      console.error('[email] ⚠ Resend failed, falling back to n8n:', msg);
    }
  }

  if (process.env.N8N_WEBHOOK_URL) {
    try {
      const result = await sendViaN8n(params);
      console.log('[email] ✓ sent via n8n fallback');
      return { success: true, provider: 'n8n', messageId: result.messageId };
    } catch (err) {
      const msg = (err as Error)?.message || 'n8n failed';
      console.error('[email] ⚠ n8n also failed:', msg);
      return { success: false, provider: 'failed', error: msg };
    }
  }

  return { success: false, provider: 'failed', error: 'No email provider configured' };
}

async function sendViaResend(resend: Resend, params: EmailParams) {
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Measurement Plan <onboarding@resend.dev>';
  const replyTo = process.env.RESEND_REPLY_TO || undefined;

  const subject = params.mode === 'audit'
    ? `Your ${params.websiteName} analytics audit is ready`
    : `Your ${params.websiteName} measurement plan is ready`;

  const greeting = params.toName ? `Hi ${params.toName.split(' ')[0]},` : 'Hi there,';

  const scoreLabel = typeof params.healthScore === 'number'
    ? `<p style="margin: 0 0 16px;"><strong>Tracking health score: ${params.healthScore}/100${params.healthGrade ? ` (${params.healthGrade})` : ''}</strong></p>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#fff;">
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px;border-radius:12px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:24px;color:#fff;">Your ${params.mode === 'audit' ? 'audit' : 'measurement plan'} is ready</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${params.websiteUrl}</p>
    </div>
    <p style="margin:0 0 16px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;line-height:1.6;">
      We've completed the ${params.mode === 'audit' ? 'audit' : 'measurement plan'} for <strong>${params.websiteName}</strong>. Your full report is attached as an Excel file.
    </p>
    ${scoreLabel}
    <p style="margin:0 0 24px;line-height:1.6;">
      The attached workbook includes ${params.mode === 'audit' ? 'your current tracking setup, missing events, and prioritized recommendations' : 'your objectives, KPIs, events, dimensions, and implementation roadmap'} — ready to share with your team.
    </p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:32px 0;" />
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6);">Have questions? Just reply to this email.</p>
    <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">Sent by Measurement Plan Agent</p>
  </div>
</body></html>`;

  const result = await resend.emails.send({
    from: fromAddress,
    to: params.to,
    replyTo,
    subject,
    html,
    attachments: [
      {
        filename: params.excelFilename,
        content: params.excelBuffer,
      },
    ],
  });

  if (result.error) throw new Error(result.error.message);
  return { messageId: result.data?.id || 'unknown' };
}

async function sendViaN8n(params: EmailParams) {
  const url = process.env.N8N_WEBHOOK_URL!;
  const subjectPrefix = params.mode === 'audit' ? 'Tracking audit for' : 'Measurement plan for';
  const subject = `${subjectPrefix} ${params.websiteUrl}`;

  const attachmentBase64 = params.excelBuffer.toString('base64');
  const payload = {
    to: params.to,
    name: params.toName || params.to.split('@')[0],
    subject,
    mode: params.mode,
    websiteUrl: params.websiteUrl,
    websiteTitle: params.websiteName,
    healthScore: params.healthScore ?? 0,
    healthGrade: params.healthGrade ?? 'N/A',
    formatsRequested: ['Excel workbook'],
    attachments: [
      {
        filename: params.excelFilename,
        content: attachmentBase64,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n returned ${res.status}`);
  const data = await res.json().catch(() => null);
  return { messageId: (data && (data.messageId || data.id)) || 'n8n-fallback' };
}
