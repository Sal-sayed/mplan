/**
 * POST /api/monitor
 *
 * Runs one stateful tracking-health check: audits the live site, diffs it
 * against the previous stored run, stores the new run, and returns the
 * DiffResult (+ `stored`). Audit-to-audit only — no Measurement Plan code.
 *
 * Body: { siteUrl: string }
 * Returns: DiffResult & { stored: boolean }  on success.
 *
 * AUTH: the existing audit path (/api/analyze) is not auth-gated (rate-limited
 * only), so there is no audit-endpoint auth pattern to copy. Per spec this
 * scheduled endpoint is gated behind an env-var secret (MONITOR_SECRET),
 * supplied as `Authorization: Bearer <secret>` or the `x-monitor-secret` header.
 */
import { NextRequest, NextResponse } from "next/server";
import { runMonitorCheck } from "@/lib/run-monitor-check";

// The audit can crawl several pages; give it room. (Enforced by Vercel; on
// Render this is advisory and the platform timeout applies instead.)
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.MONITOR_SECRET;
  if (!secret) return false; // misconfig — handled separately as 500
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = req.headers.get("x-monitor-secret");
  const provided = bearer || headerSecret || "";
  // Length-guarded equality; avoids leaking via early-exit on length mismatch.
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: NextRequest) {
  if (!process.env.MONITOR_SECRET) {
    return NextResponse.json(
      { error: "MONITOR_SECRET is not configured on the server." },
      { status: 500 }
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let siteUrl: unknown;
  try {
    ({ siteUrl } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof siteUrl !== "string" || !/^https?:\/\//.test(siteUrl)) {
    return NextResponse.json(
      { error: "siteUrl must be a string starting with http:// or https://" },
      { status: 400 }
    );
  }
  try {
    new URL(siteUrl);
  } catch {
    return NextResponse.json({ error: "Invalid siteUrl" }, { status: 400 });
  }

  try {
    const result = await runMonitorCheck(siteUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Monitor check failed";
    console.error("[monitor] check failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
