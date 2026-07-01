// DataTable — the metrics-table pattern from the design target: a white card with
// an optional title/action, a uppercase header row, and grid data rows. Generic:
// the caller supplies the column labels, the CSS grid template, and each row's
// cells (a name/sub block, values, a verdict <Badge>, a <Sparkline>, …).
import type { ReactNode } from 'react';

type Align = 'left' | 'right' | 'center';

interface Column {
  label: string;
  align?: Align;
}

const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable({
  columns,
  gridTemplate,
  rows,
  title,
  subtitle,
  action,
}: {
  columns: Column[];
  gridTemplate: string; // e.g. "1.6fr 1fr 1fr 1.1fr 1fr"
  rows: ReactNode[][]; // one array of cells per row, matching `columns`
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-ds-card shadow-[0_8px_26px_rgba(0,0,0,0.22)]">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            {title ? <div className="text-[15px] font-bold text-ds-ink">{title}</div> : null}
            {subtitle ? <div className="mt-0.5 text-xs text-ds-muted">{subtitle}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className="grid gap-3 border-y border-ds-line bg-ds-panel px-5 py-2" style={{ gridTemplateColumns: gridTemplate }}>
        {columns.map((c, i) => (
          <span key={i} className={`text-[11px] font-bold uppercase tracking-wide text-ds-muted ${ALIGN[c.align ?? 'left']}`}>{c.label}</span>
        ))}
      </div>
      {rows.map((cells, r) => (
        <div key={r} className="grid items-center gap-3 border-b border-ds-line px-5 py-3.5 last:border-b-0" style={{ gridTemplateColumns: gridTemplate }}>
          {cells.map((cell, c) => (
            <div key={c} className={`min-w-0 ${ALIGN[columns[c]?.align ?? 'left']}`}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
