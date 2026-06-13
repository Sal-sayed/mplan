// POST /api/governance/run-scheduled — machine-to-machine scheduler entrypoint.
//
// Unattended governance re-runs. A cron has no request body and no operator
// session, so this endpoint RECONSTRUCTS each site's { plan, connectors } from
// the latest persisted governance_runs row, re-runs the gate, persists the new
// run, and diffs it against the prior run (drift). It is gated by MONITOR_SECRET
// (NOT the public operator gate) — this is a trusted machine caller. The secret-
// gated, timing-safe pattern is lifted from the removed /api/monitor (0fcd396);
// none of that route's capture-model logic is.
//
// Body (optional): { sites?: Array<{ siteUrl, planKey }> }
//   - omitted  → every persisted (siteUrl, planKey) is re-run.
//   - provided → only those targets (a target with no persisted run is skipped).
// Returns: { success, anyRegression, results: SiteResult[] }.
//
// Per-site isolation: one site's storage/connector/gate failure is recorded on
// that site's result and never aborts the others.

import { NextRequest, NextResponse } from 'next/server';
import { runGovernanceCheck } from '@/lib/measurement/governance';
import {
  listLatestRuns,
  saveRun,
  buildGovernanceRun,
  type GovernanceRun,
} from '@/lib/measurement/governance-store';
import { diffReports, type DriftVerdict } from '@/lib/measurement/governance-diff';

export const maxDuration = 60; // config-only fan-out over sites — no browser capture

// Timing-safe secret compare (lifted from the removed /api/monitor). Avoids
// leaking via early-exit on a per-character mismatch.
function secretMatches(provided: string, secret: string): boolean {
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.MONITOR_SECRET;
  if (!secret) return false; // misconfig — surfaced as 500 before we get here
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const headerSecret = req.headers.get('x-monitor-secret') ?? '';
  return secretMatches(bearer || headerSecret, secret);
}

interface SiteResult {
  siteUrl: string;
  planKey: string;
  verdict?: DriftVerdict;
  regressions?: string[];
  skipped?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.MONITOR_SECRET) {
    return NextResponse.json(
      { success: false, error: 'MONITOR_SECRET is not configured on the server.' },
      { status: 500 }
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Resolve targets from persistence. Each carries the prior run (plan +
  // connectors + report) needed to re-run and to diff against.
  let targets: Array<{ siteUrl: string; planKey: string; prior: GovernanceRun | null }>;
  try {
    const persisted = await listLatestRuns();
    if (Array.isArray(body?.sites) && body.sites.length > 0) {
      const byKey = new Map(persisted.map((r) => [`${r.siteUrl}::${r.planKey}`, r]));
      targets = body.sites
        .filter((s: unknown): s is { siteUrl: string; planKey: string } =>
          !!s && typeof (s as { siteUrl?: unknown }).siteUrl === 'string' && typeof (s as { planKey?: unknown }).planKey === 'string'
        )
        .map((s: { siteUrl: string; planKey: string }) => ({
          siteUrl: s.siteUrl,
          planKey: s.planKey,
          prior: byKey.get(`${s.siteUrl}::${s.planKey}`) ?? null,
        }));
    } else {
      targets = persisted.map((r) => ({ siteUrl: r.siteUrl, planKey: r.planKey, prior: r }));
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error)?.message || 'Failed to resolve scheduled targets' },
      { status: 500 }
    );
  }

  const results: SiteResult[] = [];
  for (const t of targets) {
    // Per-site isolation — never let one site abort the run.
    try {
      if (!t.prior) {
        results.push({ siteUrl: t.siteUrl, planKey: t.planKey, skipped: true, error: 'no persisted run' });
        continue;
      }
      if (!t.prior.plan) {
        results.push({ siteUrl: t.siteUrl, planKey: t.planKey, skipped: true, error: 'no persisted plan — cannot re-run' });
        continue;
      }

      const plan = t.prior.plan;
      const connectors = t.prior.connectors;
      // The gate resolves the (global, single-operator) Google token itself via
      // token-store; we only supply the per-site connector ids. Absent connectors
      // → those GA4/GTM checks stay skipped (never a crash).
      const { report } = await runGovernanceCheck(
        { url: t.siteUrl, plan, ga4: connectors?.ga4, gtm: connectors?.gtm },
        { ownerId: t.prior.user_id ?? 'admin' } // Stage 4: use the run owner's token
      );

      const drift = diffReports(t.prior.report, report);
      // Preserve the run's owner (Stage 2) — the cron acts on behalf of each user.
      await saveRun(buildGovernanceRun(report, plan, t.prior.user_id ?? 'admin', connectors));

      results.push({
        siteUrl: t.siteUrl,
        planKey: t.planKey,
        verdict: drift.verdict,
        regressions: drift.regressions,
      });
    } catch (err) {
      results.push({ siteUrl: t.siteUrl, planKey: t.planKey, error: (err as Error)?.message || 'site run failed' });
    }
  }

  const anyRegression = results.some((r) => r.verdict === 'regression');
  return NextResponse.json({ success: true, anyRegression, results });
}
