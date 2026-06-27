'use client';

// /design-preview — a throwaway REFERENCE page that renders the new design system
// (shell + every core component) with sample data, so the light enterprise direction
// is visible before any real screen is converted. Not linked from the app; uses NO
// real data, logic, or API. Delete or replace once screens are migrated.

import { Wrench, Tag, GitPullRequest } from 'lucide-react';
import { AppShell, Card, StatTile, Badge, StepRow, Button, VerdictBanner } from '@/components/ds';

export default function DesignPreviewPage() {
  return (
    <AppShell currentStage={3} statuses={{ 1: 'done', 2: 'done' }} siteName="fortuneinnovatives.com">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ds-ink">Go live</h1>
          <p className="mt-1 text-sm text-ds-secondary">
            A quick check that everything is wired up before you launch. This page is a design preview — sample data only.
          </p>
        </div>

        <VerdictBanner variant="success" title="Ready to launch">
          All 9 readiness checks passed. You can publish your GTM workspace whenever you’re ready.
        </VerdictBanner>

        {/* Summary stats */}
        <Card>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatTile label="Key events" value={6} hint="3 firing" />
            <StatTile label="No code" value={4} hint="via GTM triggers" />
            <StatTile label="Needs dev" value={2} hint="dataLayer pushes" />
            <StatTile label="Checks" value="9/9" hint="all passing" />
          </div>
        </Card>

        {/* Checklist */}
        <Card className="p-0">
          <div className="border-b border-ds-line px-5 py-3">
            <p className="text-sm font-medium text-ds-ink">Setup checklist</p>
          </div>
          <div className="divide-y divide-ds-line">
            <StepRow icon={Tag} title="GTM container" subtitle="GTM-XXXXXXX · unpublished workspace" status={<Badge variant="success">done</Badge>} done />
            <StepRow icon={Wrench} title="GA4 property" subtitle="G-XXXXXXX created" status={<Badge variant="success">done</Badge>} done />
            <StepRow icon={GitPullRequest} title="Add GTM to your site" subtitle="opens a pull request" status={<Badge variant="warning">needs dev</Badge>} />
          </div>
        </Card>

        {/* Capture split */}
        <Card>
          <p className="text-sm font-medium text-ds-ink">How each event is handled</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="success">page_view — no code</Badge>
            <Badge variant="success">contact_click — no code</Badge>
            <Badge variant="warning">purchase — needs dev</Badge>
            <Badge variant="neutral">draft</Badge>
          </div>
        </Card>

        {/* Actions — one primary */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => {}}>Back</Button>
          <Button variant="primary" onClick={() => {}}>Run readiness check</Button>
        </div>
      </div>
    </AppShell>
  );
}
