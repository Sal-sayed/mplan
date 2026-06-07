// One-off live run: audits the target and prints the resulting DiffResult.
// Usage: npx tsx scripts/monitor-live-once.ts [siteUrl]
import { runMonitorCheck } from "../lib/run-monitor-check";

(async () => {
  const siteUrl = process.argv[2] || "https://oral-b.co.in/en-in";
  console.log(`\n>>> runMonitorCheck("${siteUrl}")\n`);
  const result = await runMonitorCheck(siteUrl);
  console.log("\n=================== DiffResult ===================");
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error("live run failed:", err);
  process.exit(1);
});
