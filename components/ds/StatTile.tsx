// StatTile — a muted label above a large number, for summary figures.
import type { ReactNode } from 'react';

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ds-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-ds-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ds-secondary">{hint}</p> : null}
    </div>
  );
}
