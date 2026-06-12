// run-metrics-cron.mjs
// Render Cron entrypoint for the GA4 metric collector (starts/advances the data
// clock for the threshold Data Validation agent).
//
// DEPLOY TARGET = RENDER. Configure a Render **Cron Job** that runs:
//
//     node scripts/run-metrics-cron.mjs
//
// daily (e.g. "0 8 * * *"). Env the cron job needs:
//
//     APP_BASE_URL     the deployed app, e.g. https://mplan-1.onrender.com
//     MONITOR_SECRET   same value as the web service's MONITOR_SECRET
//
// It POSTs /api/metrics/fetch-scheduled with Bearer MONITOR_SECRET and exits
// non-zero if ANY property's fetch errored, so Render surfaces the failure.

const baseUrl = process.env.APP_BASE_URL;
const secret = process.env.MONITOR_SECRET;

if (!baseUrl || !secret) {
  console.error('Missing APP_BASE_URL or MONITOR_SECRET env var.');
  process.exit(2);
}

const endpoint = new URL('/api/metrics/fetch-scheduled', baseUrl).toString();

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({}),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${body.error ?? 'unknown error'}`);
    process.exit(1);
  }

  const results = body.results ?? [];
  let anyError = false;
  for (const r of results) {
    if (r.error) {
      anyError = true;
      console.error(`[${r.propertyId}] ${r.skipped ? 'skipped' : 'error'}: ${r.error}`);
    } else {
      console.log(`[${r.propertyId}] saved ${r.rowsSaved} row(s)`);
    }
  }
  console.log(`Collected ${results.length} property(ies).`);

  process.exit(anyError ? 1 : 0);
} catch (err) {
  console.error(`Request failed: ${err?.message ?? err}`);
  process.exit(1);
}
