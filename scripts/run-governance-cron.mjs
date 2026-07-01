// run-governance-cron.mjs
// Render Cron entrypoint for unattended Measurement Governance (drift detection).
//
// DEPLOY TARGET = RENDER. Configure a Render **Cron Job** that runs:
//
//     node scripts/run-governance-cron.mjs
//
// on a schedule (e.g. "0 * * * *" hourly). Env the cron job needs:
//
//     APP_BASE_URL     the deployed app, e.g. https://mplan-1.onrender.com
//     MONITOR_SECRET   same value as the web service's MONITOR_SECRET
//     SCHEDULED_SITES  OPTIONAL JSON array of { "siteUrl", "planKey" } targets.
//                      Omit to re-run EVERY persisted (site, plan).
//
// It POSTs /api/governance/run-scheduled with Bearer MONITOR_SECRET and exits
// non-zero if ANY site's drift verdict is 'regression', so Render surfaces the
// run as failed and it shows up in alerting. (Capture-model logic from the old
// run-monitor-cron is intentionally NOT carried over — this is report-to-report.)
//
// The POST goes through fetchWithRetry so a cold-started Render app (which answers
// 502/503/504 for the first ~30–60s) is retried, not treated as a hard failure.

import { fetchWithRetry } from './lib/fetch-retry.mjs';

const baseUrl = process.env.APP_BASE_URL;
const secret = process.env.MONITOR_SECRET;

if (!baseUrl || !secret) {
  console.error('Missing APP_BASE_URL or MONITOR_SECRET env var.');
  process.exit(2);
}

let sites;
if (process.env.SCHEDULED_SITES) {
  try {
    sites = JSON.parse(process.env.SCHEDULED_SITES);
    if (!Array.isArray(sites)) throw new Error('must be a JSON array');
  } catch (err) {
    console.error(`Invalid SCHEDULED_SITES: ${err?.message ?? err}`);
    process.exit(2);
  }
}

const endpoint = new URL('/api/governance/run-scheduled', baseUrl).toString();

try {
  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(sites ? { sites } : {}),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${body.error ?? 'unknown error'}`);
    process.exit(1);
  }

  const results = body.results ?? [];
  for (const r of results) {
    const label = r.skipped
      ? `skipped (${r.error})`
      : r.error
        ? `error (${r.error})`
        : `verdict=${r.verdict}`;
    console.log(`[${r.siteUrl}] ${label}`);
    if (r.verdict === 'regression' && r.regressions?.length) {
      console.log(`            ! regressed checks: ${r.regressions.join(', ')}`);
    }
  }
  console.log(`Checked ${results.length} site(s). anyRegression=${body.anyRegression === true}`);

  // Non-zero on any regression so the Render cron run is marked failed.
  process.exit(body.anyRegression ? 1 : 0);
} catch (err) {
  console.error(`Request failed: ${err?.message ?? err}`);
  process.exit(1);
}
