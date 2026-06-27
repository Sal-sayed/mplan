# Design system (`components/ds`) — light enterprise foundation

The clean, light, enterprise-SaaS look for the new **Plan → Set up → Go live → Monitor**
journey. **Additive** — it ships alongside the current app and is adopted screen by
screen. Adding it restyles **nothing**: every color comes from namespaced `ds-*`
Tailwind utilities (defined in `app/globals.css`), so the existing app tokens
(`bg-app`, `text-ink`, …) are untouched.

See it rendered at **`/design-preview`**.

## Tokens

Always-light palette, namespaced so they don't collide with the existing theme:

| Utility | Use |
|---|---|
| `bg-ds-page` / `bg-ds-card` / `bg-ds-panel` | page bg / card surface / inset panel |
| `text-ds-ink` / `text-ds-secondary` / `text-ds-muted` | primary / secondary / muted text |
| `border-ds-line` / `border-ds-line-strong` | soft hairline / stronger hairline |
| `bg-ds-accent` / `text-ds-accent` / `bg-ds-accent-soft` | the one accent (blue) |
| `*-ds-success` / `*-ds-warning` / `*-ds-danger` (+ `-soft`) | semantic colors |
| `rounded-ds` | 12px radius |

Variant→class logic lives in `tokens.ts` (pure, unit-tested): `badgeClasses`,
`verdictClasses`, `buttonClasses`, plus the journey helpers `computeJourneyNav`,
`progressPercent`, `stepLabel`.

## Components

All presentational, token-driven, no business logic.

```tsx
import {
  AppShell, Card, StatTile, Badge, StepRow, Button, VerdictBanner,
} from '@/components/ds';
import { Wrench } from 'lucide-react';

// App frame — top bar, journey nav, "Step N of 4" progress, content.
<AppShell currentStage={2} statuses={{ 1: 'done' }} siteName="example.com">
  {/* Card — the base surface */}
  <Card>
    <StatTile label="Key events" value={6} hint="3 firing" />
  </Card>

  {/* Badge — labels */}
  <Badge variant="success">no code</Badge>
  <Badge variant="warning">needs dev</Badge>
  <Badge variant="neutral">draft</Badge>

  {/* StepRow — checklist item */}
  <StepRow icon={Wrench} title="Create GTM container" subtitle="unpublished workspace"
           status={<Badge variant="success">done</Badge>} done />

  {/* Buttons — one primary per screen */}
  <Button variant="primary" onClick={() => {}}>Run check</Button>
  <Button variant="secondary">Cancel</Button>

  {/* VerdictBanner — the readiness result */}
  <VerdictBanner variant="success" title="Ready to launch">
    All checks passed.
  </VerdictBanner>
</AppShell>
```

### Conventions
- **One primary action per screen** — use `Button variant="primary"` once; everything
  else is `secondary`.
- **Sentence case**, friendly, no shouting.
- The shell is **pure presentational** — pass `currentStage` / `statuses` / `siteName`
  from the screen; it never fetches data.
