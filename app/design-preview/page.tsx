'use client';

// /design-preview — a throwaway REFERENCE page that renders the rethemed design
// system (dark shell + every restyled primitive) with sample data, so the whole kit
// is visible on one page before the real Monitor screen is converted. Not linked from
// the app; uses NO real data, logic, or API. Delete or replace once screens migrate.

import { Tag, Wrench, GitPullRequest } from 'lucide-react';
import { AppShell, Card, StatTile, Badge, StepRow, Button, VerdictBanner, Sparkline, Select, DataTable } from '@/components/ds';

const UP = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14];
const FLAT = [8, 7, 8, 8, 7, 8, 8, 9, 8, 8];
const DOWN = [14, 12, 13, 10, 11, 8, 9, 6, 7, 5];

// One labelled block per component group.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-ds-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPreviewPage() {
  return (
    <AppShell
      currentStage={4}
      statuses={{ 1: 'done', 2: 'done', 3: 'done' }}
      siteName="fortuneinnovatives.com"
      user={{ name: 'Dana Mercer', role: 'Analytics lead' }}
    >
      <div className="mx-auto max-w-5xl space-y-10 pb-16">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ds-ink">Design system</h1>
          <p className="mt-1 text-sm text-ds-secondary">
            The rethemed kit — dark shell, light cards, green accent. Sample data only.
          </p>
        </div>

        {/* Verdict banners */}
        <Section title="Verdict banners">
          <div className="grid gap-4 md:grid-cols-3">
            <VerdictBanner variant="success" kicker="Overall health" title="Healthy">
              All 24 key events firing within threshold over the last 30 days.
            </VerdictBanner>
            <VerdictBanner variant="warning" kicker="Overall health" title="Worth a look">
              3 events are below their expected volume — likely a seasonal dip.
            </VerdictBanner>
            <VerdictBanner variant="danger" kicker="Overall health" title="At risk">
              purchase stopped firing 2 days ago. Check the checkout tag.
            </VerdictBanner>
          </div>
        </Section>

        {/* Stat tiles */}
        <Section title="Stat tiles">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile variant="dark" label="Events / day" value="18.4k" delta={{ text: '12%', up: true }} series={UP} />
            <StatTile label="Key events" value={24} unit="tracked" delta={{ text: '2', up: true }} series={UP} />
            <StatTile label="Firing rate" value="96%" delta={{ text: '1.2%', up: false }} series={DOWN} />
            <StatTile label="Data health" value="Stable" series={FLAT} hint="7-day trend" />
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => {}}>Run readiness check</Button>
              <Button variant="secondary" onClick={() => {}}>View report</Button>
              <Button variant="ghost" onClick={() => {}}>Cancel</Button>
              <Button variant="primary" disabled onClick={() => {}}>Disabled</Button>
            </div>
          </Card>
        </Section>

        {/* Badges */}
        <Section title="Badges">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" dot>Healthy</Badge>
              <Badge variant="warning" dot>Watch</Badge>
              <Badge variant="danger" dot>At risk</Badge>
              <Badge variant="neutral">Draft</Badge>
              <Badge variant="success">no code</Badge>
              <Badge variant="warning">needs dev</Badge>
            </div>
          </Card>
        </Section>

        {/* Select */}
        <Section title="Select">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                defaultValue="all"
                options={[
                  { value: 'all', label: 'All metrics' },
                  { value: 'ecom', label: 'Ecommerce' },
                  { value: 'engage', label: 'Engagement' },
                ]}
              />
              <Select
                defaultValue="30"
                options={[
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                ]}
              />
            </div>
          </Card>
        </Section>

        {/* Sparklines */}
        <Section title="Sparklines">
          <Card>
            <div className="flex flex-wrap items-center gap-8">
              <Sparkline data={UP} color="var(--ds-accent-spark)" />
              <Sparkline data={FLAT} color="var(--ds-accent-spark)" />
              <Sparkline data={DOWN} color="var(--ds-danger)" />
            </div>
          </Card>
        </Section>

        {/* Data table */}
        <Section title="Data table">
          <DataTable
            title="Metrics"
            subtitle="Last 30 days · sample data"
            action={<Select defaultValue="all" options={[{ value: 'all', label: 'All metrics' }, { value: 'ecom', label: 'Ecommerce' }]} />}
            columns={[
              { label: 'Metric' },
              { label: '30-day', align: 'right' },
              { label: 'Δ', align: 'right' },
              { label: 'Status' },
              { label: 'Trend', align: 'right' },
            ]}
            gridTemplate="1.6fr 1fr 0.8fr 1.1fr 1fr"
            rows={[
              [
                <div key="n"><div className="font-semibold text-ds-ink">add_to_cart</div><div className="text-xs text-ds-muted">ecommerce</div></div>,
                <span key="v" className="font-semibold tabular-nums text-ds-ink">1,240</span>,
                <span key="d" className="font-semibold tabular-nums text-ds-accent-text">▲ 12%</span>,
                <Badge key="s" variant="success" dot>Healthy</Badge>,
                <div key="t" className="flex justify-end"><Sparkline data={UP} color="var(--ds-accent-spark)" /></div>,
              ],
              [
                <div key="n"><div className="font-semibold text-ds-ink">newsletter_signup</div><div className="text-xs text-ds-muted">engagement</div></div>,
                <span key="v" className="font-semibold tabular-nums text-ds-ink">312</span>,
                <span key="d" className="font-semibold tabular-nums text-ds-secondary">▲ 1%</span>,
                <Badge key="s" variant="warning" dot>Watch</Badge>,
                <div key="t" className="flex justify-end"><Sparkline data={FLAT} color="var(--ds-accent-spark)" /></div>,
              ],
              [
                <div key="n"><div className="font-semibold text-ds-ink">purchase</div><div className="text-xs text-ds-muted">ecommerce</div></div>,
                <span key="v" className="font-semibold tabular-nums text-ds-ink">0</span>,
                <span key="d" className="font-semibold tabular-nums text-ds-danger">▼ 100%</span>,
                <Badge key="s" variant="danger" dot>At risk</Badge>,
                <div key="t" className="flex justify-end"><Sparkline data={DOWN} color="var(--ds-danger)" /></div>,
              ],
            ]}
          />
        </Section>

        {/* Checklist (StepRow) */}
        <Section title="Checklist rows">
          <Card className="p-0">
            <div className="border-b border-ds-line px-5 py-3">
              <p className="text-sm font-semibold text-ds-ink">Setup checklist</p>
            </div>
            <div className="divide-y divide-ds-line">
              <StepRow icon={Tag} title="GTM container" subtitle="GTM-XXXXXXX · unpublished workspace" status={<Badge variant="success" dot>done</Badge>} done />
              <StepRow icon={Wrench} title="GA4 property" subtitle="G-XXXXXXX created" status={<Badge variant="success" dot>done</Badge>} done />
              <StepRow icon={GitPullRequest} title="Add GTM to your site" subtitle="opens a pull request" status={<Badge variant="warning" dot>needs dev</Badge>} />
            </div>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
