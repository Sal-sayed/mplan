// ───────────────────────────────────────────────────────────────────────────
// DEV / TEST ONLY — synthetic metric seed-and-verify harness.
//
// NOT wired into the app or any cron. It seeds fake history into ga4_metric_daily
// under an OBVIOUSLY-synthetic property id, runs the REAL validateMetrics against
// it (a true round-trip through the live store), prints each verdict vs expected
// (PASS/FAIL), then DELETES every synthetic row in a finally block — so nothing
// is ever left behind, even if a check throws.
//
// It does NOT modify the validator, store, or reader — it only reads them.
//
//   Run:    node --env-file=.env.local scripts/seed-and-verify-metrics.mjs
//   Clean:  node --env-file=.env.local scripts/seed-and-verify-metrics.mjs --clean
//
// This proves the metric LOGIC on correctly-shaped data. It does NOT prove
// real-world behavior on a live site — that needs real traffic, which isn't
// available. If Supabase isn't configured, it says so and exits; the permanent
// in-memory guard is the node:test in lib/measurement/data-validation.test.ts.
// ───────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const TEST_PROPERTY_ID = 'TEST_SYNTHETIC_000'; // obvious + can never collide with a real GA4 property id
const TABLE = 'ga4_metric_daily';
const METRIC = 'eventCount';
const ON_CONFLICT = 'property_id,metric_name,dimension_value,date';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('⚠ Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset).');
  console.log('  Run with:  node --env-file=.env.local scripts/seed-and-verify-metrics.mjs');
  console.log('  The in-memory guard (npm test → data-validation.test.ts) still proves the logic without Supabase.');
  process.exit(0);
}
const sb = createClient(url, key);

// 'YYYY-MM-DD' for (today - daysAgo), UTC.
function isoDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Ascending-date rows for one synthetic event: values[0] is the OLDEST day,
// the last value is yesterday (the "latest" the validator judges).
function rowsFor(dimensionValue, values) {
  const n = values.length;
  const fetchedAt = new Date().toISOString();
  return values.map((value, i) => ({
    property_id: TEST_PROPERTY_ID,
    metric_name: METRIC,
    dimension_value: dimensionValue,
    date: isoDaysAgo(n - i),
    value,
    fetched_at: fetchedAt,
  }));
}

async function cleanup() {
  const { error } = await sb.from(TABLE).delete().eq('property_id', TEST_PROPERTY_ID);
  if (error) console.error(`✗ cleanup failed: ${error.message}`);
  else console.log(`✓ cleaned up synthetic rows for ${TEST_PROPERTY_ID}`);
}

// The three controlled histories. KEPT IN SYNC with the node:test in
// lib/measurement/data-validation.test.ts ("synthetic ... mirrors the dev script").
const STABLE = [98, 102, 100, 99, 101, 100, 100, 103, 97, 100, 101, 99, 100, 100]; // 14d ~100 → ok
const DROP = [...Array(13).fill(100), 20]; // 13d ~100 then a 80% fall → regression (dropped)
const THIN = [100, 20]; // 2 days < minHistoryDays(4) → inconclusive

async function run() {
  // Clean any leftovers, then seed (upsert on the PK → idempotent across re-runs).
  await cleanup();
  const seed = [
    ...rowsFor('stable_event', STABLE),
    ...rowsFor('drop_event', DROP),
    ...rowsFor('thin_event', THIN),
  ];
  const { error } = await sb.from(TABLE).upsert(seed, { onConflict: ON_CONFLICT });
  if (error) throw new Error(`seed insert failed: ${error.message}`);
  console.log(`✓ seeded ${seed.length} synthetic rows under ${TEST_PROPERTY_ID}\n`);

  // Import the REAL validator — it reads the REAL store, which reads the rows we
  // just seeded into Supabase. No injection: this is the genuine round-trip.
  const { validateMetrics } = await import('../lib/measurement/data-validation.ts');

  const cases = [
    { name: 'STABLE (14d ~100/day)', dimensionValue: 'stable_event', expected: 'ok' },
    { name: 'DROP (100/day → 20)', dimensionValue: 'drop_event', expected: 'regression' },
    { name: 'THIN (2 days only)', dimensionValue: 'thin_event', expected: 'inconclusive' },
  ];

  let allPass = true;
  for (const c of cases) {
    const res = await validateMetrics({ propertyId: TEST_PROPERTY_ID, metricName: METRIC, dimensionValue: c.dimensionValue });
    const pass = res.verdict === c.expected;
    allPass = allPass && pass;
    console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${c.name.padEnd(22)} expected=${c.expected.padEnd(12)} got=${res.verdict}`);
    if (res.finding) console.log(`          └─ ${res.finding.kind}: ${res.finding.detail}`);
  }
  console.log(`\n${allPass ? '✅ ALL CASES PASS' : '❌ SOME CASES FAILED'}`);
  return allPass ? 0 : 1;
}

let code = 1;
try {
  if (process.argv.includes('--clean')) {
    await cleanup();
    code = 0;
  } else {
    code = await run();
  }
} catch (err) {
  console.error('Error:', err?.message ?? err);
  code = 1;
} finally {
  // ALWAYS remove synthetic data — never leave it in the real table.
  await cleanup();
}
process.exit(code);
