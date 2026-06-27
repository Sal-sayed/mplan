// StepRow — a checklist row: icon + title + subtitle, with a right-aligned status
// slot (e.g. a Badge or a check). Presentational.
import type { ComponentType, ReactNode } from 'react';

interface StepRowProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
  status?: ReactNode; // right side — a <Badge>, a check, text, etc.
  done?: boolean; // tints the icon chip green when complete
}

export function StepRow({ icon: Icon, title, subtitle, status, done = false }: StepRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {Icon ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            done ? 'bg-ds-success-soft text-ds-success' : 'bg-ds-accent-soft text-ds-accent'
          }`}
        >
          <Icon size={16} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ds-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ds-secondary">{subtitle}</p> : null}
      </div>
      {status ? <div className="shrink-0">{status}</div> : null}
    </div>
  );
}
