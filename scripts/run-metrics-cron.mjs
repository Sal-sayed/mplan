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
// It POSTs /api/metrics/fetch-scheduled with Bearer MONITOR_SECRET.
//
// RESILIENT exit policy: a property that can't be read because its owner hasn't
// connected Google or the connected account lacks access is an EXPECTED, skippable
// condition (the route flags it `skipped`) — logged as a warning, the run keeps
// going. The job exits non-zero ONLY for a genuine failure: the app is unreachable
// / returns non-2xx, or a property hit an UNEXPECTED error (GA4 5xx, store write).
// One inaccessible property no longer red-X's the whole run.

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
  let collected = 0;
  const skips = [];
  const failures = [];
  for (const r of results) {
    if (r.skipped) {
      skips.push(r);
      console.warn(`[${r.propertyId}] skipped: ${r.error ?? 'not accessible'}`);
    } else if (r.error) {
      failures.push(r);
      console.error(`[${r.propertyId}] ERROR: ${r.error}`);
    } else {
      collected++;
      console.log(`[${r.propertyId}] saved ${r.rowsSaved} row(s)`);
    }
  }

  console.log(
    `Done: ${collected} collected, ${skips.length} skipped, ${failures.length} failed (of ${results.length} property[ies]).`
  );

  // Exit 0 when the run completed — even with skips. Non-zero ONLY for a genuine
  // unexpected per-property failure (skips don't count); transport/HTTP failures
  // are handled above and in the catch.
  process.exit(failures.length > 0 ? 1 : 0);
} catch (err) {
  console.error(`Request failed: ${err?.message ?? err}`);
  process.exit(1);
}
