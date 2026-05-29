/**
 * sendReportEmail.js
 *
 * Sends a formatted GA4 audit report via Gmail using Nodemailer.
 * Includes HTML email body with tracking IDs, summary stats, event comparison table,
 * and attaches JSON + CSV files.
 *
 * Requires env vars: GMAIL_USER, GMAIL_APP_PASSWORD
 * (Enable 2FA on Google account, generate app password at https://myaccount.google.com/apppasswords)
 *
 * Usage:
 *   const { sendReportEmail } = require('./sendReportEmail');
 *   await sendReportEmail({ to, siteName, scrapeReport, diff, subject });
 */

const nodemailer = require('nodemailer');

/**
 * @param {object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.siteName - Site name (from hostname)
 * @param {object} opts.scrapeReport - Full scrape report from scrapeGA4Events()
 * @param {object} opts.diff - Diff result from diffAgainstPlan()
 * @param {string} [opts.subject] - Custom subject (auto-generated if omitted)
 */
async function sendReportEmail({ to, siteName, scrapeReport, diff, subject }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables. See https://myaccount.google.com/apppasswords');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const { summary } = diff;
  const autoSubject = subject || `GA4 Audit — ${siteName} — ${summary.implemented}/${summary.totalRecommended} events implemented`;
  const slug = siteName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);

  // ─── BUILD HTML BODY ───
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 24px;">

  <h1 style="color:#f1f5f9;font-size:24px;margin-bottom:4px;">GA4 Audit Report</h1>
  <p style="color:#94a3b8;font-size:14px;margin-top:0;">${siteName} &mdash; ${scrapeReport.scrapedAt}</p>

  <!-- Tracking IDs -->
  <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:20px 0;">
    <h3 style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-top:0;">Detected Tracking Setup</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="color:#94a3b8;font-size:12px;padding:4px 8px;">GA4 Measurement IDs</td>
        <td style="color:#f1f5f9;font-family:monospace;font-size:13px;padding:4px 8px;">${scrapeReport.measurementIds.length > 0 ? scrapeReport.measurementIds.join(', ') : '<span style="color:#64748b;">None detected</span>'}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;font-size:12px;padding:4px 8px;">GTM Containers</td>
        <td style="color:#f1f5f9;font-family:monospace;font-size:13px;padding:4px 8px;">${scrapeReport.gtmContainers.map(c => c.id).join(', ') || '<span style="color:#64748b;">None detected</span>'}</td>
      </tr>
      ${scrapeReport.legacyUA.length > 0 ? `<tr>
        <td style="color:#f59e0b;font-size:12px;padding:4px 8px;">&#9888; Legacy UA</td>
        <td style="color:#f59e0b;font-family:monospace;font-size:13px;padding:4px 8px;">${scrapeReport.legacyUA.join(', ')} (deprecated)</td>
      </tr>` : ''}
    </table>
  </div>

  <!-- Summary Stats -->
  <div style="display:flex;gap:12px;margin:20px 0;">
    <div style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#3b82f6;">${summary.implemented}/${summary.totalRecommended}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Implemented</div>
    </div>
    <div style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#ef4444;">${summary.mustHaveMissing}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">MUST HAVE Missing</div>
    </div>
    <div style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#f59e0b;">${summary.missing}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Total Missing</div>
    </div>
    <div style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#10b981;">${summary.extraEventsFound}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Extra Events</div>
    </div>
  </div>

  <!-- Event Comparison -->
  <h3 style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Event-by-Event Comparison</h3>
  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
    <tr style="background:#1e293b;">
      <th style="text-align:left;padding:8px;color:#94a3b8;font-size:11px;border-bottom:1px solid #334155;">Status</th>
      <th style="text-align:left;padding:8px;color:#94a3b8;font-size:11px;border-bottom:1px solid #334155;">Event Name</th>
      <th style="text-align:left;padding:8px;color:#94a3b8;font-size:11px;border-bottom:1px solid #334155;">Priority</th>
      <th style="text-align:left;padding:8px;color:#94a3b8;font-size:11px;border-bottom:1px solid #334155;">Description</th>
    </tr>
    ${diff.comparison.map(c => {
      const icon = c.status === 'implemented' ? '&#x2705;' : '&#x274C;';
      const priColor = c.priority === 'MUST' ? '#ef4444' : c.priority === 'SHOULD' ? '#f59e0b' : '#10b981';
      return `<tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:8px;font-size:16px;">${icon}</td>
        <td style="padding:8px;font-family:monospace;color:#60a5fa;font-size:13px;">${c.name}</td>
        <td style="padding:8px;"><span style="background:${priColor}22;color:${priColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;">${c.priority} HAVE</span></td>
        <td style="padding:8px;color:#64748b;font-size:12px;">${c.description || ''}</td>
      </tr>`;
    }).join('')}
  </table>

  ${diff.extraEvents.length > 0 ? `
  <h3 style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-top:24px;">Extra Events Detected (not in plan)</h3>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">
    ${diff.extraEvents.map(e => `<span style="background:#1e293b;border:1px solid #334155;padding:4px 10px;border-radius:4px;font-family:monospace;font-size:12px;color:#10b981;">${e}</span>`).join('')}
  </div>` : ''}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #334155;color:#64748b;font-size:11px;">
    Generated by Web Analytics Measurement Plan Agent &mdash; Powered by Claude AI
  </div>
</div>
</body>
</html>`;

  // ─── BUILD ATTACHMENTS ───
  const jsonContent = JSON.stringify({ scrapeReport, diff }, null, 2);

  const csvRows = ['status,event_name,priority,description'];
  diff.comparison.forEach(c => {
    csvRows.push(`${c.status},"${c.name}",${c.priority},"${(c.description || '').replace(/"/g, '""')}"`);
  });
  const csvContent = csvRows.join('\n');

  // ─── SEND ───
  const info = await transporter.sendMail({
    from: `"GA4 Audit" <${user}>`,
    to,
    subject: autoSubject,
    html,
    attachments: [
      { filename: `ga4-audit-${slug}-${dateStr}.json`, content: jsonContent, contentType: 'application/json' },
      { filename: `ga4-audit-${slug}-${dateStr}.csv`, content: csvContent, contentType: 'text/csv' },
    ],
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

module.exports = { sendReportEmail };
