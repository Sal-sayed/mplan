// run-monitor-cron.mjs
// Scheduled entrypoint for the Tracking-Health Monitor.
//
// DEPLOY TARGET = RENDER (evidence: lib/leads-store.ts references Render, and
// there is no vercel.json). Configure a Render **Cron Job** that runs:
//
//     node scripts/run-monitor-cron.mjs
//
// on a schedule (e.g. "0 * * * *" hourly). The cron job needs these env vars:
//
//     APP_BASE_URL    e.g. https://your-app.onrender.com   (the deployed app)
//     MONITOR_SECRET  same value as the web service's MONITOR_SECRET
//     MONITOR_SITES   comma-separated site URLs to check
//                     e.g. https://oral-b.co.in/en-in,https://example.com
//
// It POSTs each site to /api/monitor and exits non-zero if ANY site reports a
// regression, so Render surfaces the run as failed and you get visibility.
//
// (If you ever move to Vercel instead, replace this with a vercel.json `crons`
// entry hitting /api/monitor — but that is NOT this project's deploy target.)

const baseUrl = process.env.APP_BASE_URL;
const secret = process.env.MONITOR_SECRET;
const sites = (process.env.MONITOR_SITES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!baseUrl || !secret) {
  console.error("Missing APP_BASE_URL or MONITOR_SECRET env var.");
  process.exit(2);
}
if (sites.length === 0) {
  console.error("MONITOR_SITES is empty — nothing to check.");
  process.exit(2);
}

const endpoint = new URL("/api/monitor", baseUrl).toString();
let anyRegression = false;
let anyError = false;

for (const siteUrl of sites) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ siteUrl }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      anyError = true;
      console.error(`[${siteUrl}] HTTP ${res.status}: ${body.error ?? "unknown error"}`);
      continue;
    }

    console.log(`[${siteUrl}] verdict=${body.verdict} confidence=${body.confidence} stored=${body.stored}`);
    console.log(`            ${body.summary}`);
    if (body.verdict === "regression") {
      anyRegression = true;
      for (const f of body.findings ?? []) {
        if (f.severity === "critical") console.log(`            ! ${f.detail}`);
      }
    }
  } catch (err) {
    anyError = true;
    console.error(`[${siteUrl}] request failed: ${err?.message ?? err}`);
  }
}

// Non-zero exit on regression (or transport error) so the Render cron run is
// marked failed and shows up in alerting.
process.exit(anyRegression || anyError ? 1 : 0);
