// StatTile — a KPI tile from the design target. Two looks: a dark "headline" tile
// (the lead KPI, dark shell surface) and light tiles (white cards). Each can carry
// a delta (▲/▼ vs. prior) and an inline sparkline. Back-compatible: the old
// { label, value, hint } call still works (renders a light tile).
import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline.tsx';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  unit?: string;
  delta?: { text: string; up?: boolean };
  series?: number[];
  variant?: 'light' | 'dark';
}

export function StatTile({ label, value, hint, unit, delta, series, variant = 'light' }: StatTileProps) {
  const dark = variant === 'dark';
  const wrap = dark
    ? 'border-ds-accent/20 bg-ds-shell-raised'
    : 'border-ds-line bg-ds-card';
  const labelCls = dark ? 'text-ds-shell-secondary' : 'text-ds-secondary';
  const valueCls = dark ? 'text-ds-shell-ink' : 'text-ds-ink';
  const unitCls = dark ? 'text-ds-shell-muted' : 'text-ds-muted';
  const sparkColor = dark ? 'var(--ds-accent-bright)' : 'var(--ds-accent-spark)';
  const deltaCls = delta?.up ? (dark ? 'text-ds-accent-bright' : 'text-ds-accent-text') : 'text-ds-danger';

  return (
    <div className={`flex min-h-[132px] flex-col rounded-2xl border p-[18px] shadow-[0_8px_26px_rgba(0,0,0,0.22)] ${wrap}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${labelCls}`}>{label}</span>
        {unit ? <span className={`text-[11px] ${unitCls}`}>{unit}</span> : null}
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${valueCls}`}>{value}</div>
      <div className="flex-1" />
      {(delta || series) && (
        <div className="flex items-end justify-between gap-2">
          {delta ? (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${deltaCls}`}>
              <span>{delta.up ? '▲' : '▼'}</span>
              <span className="tabular-nums">{delta.text}</span>
            </span>
          ) : <span />}
          {series ? <Sparkline data={series} color={sparkColor} /> : null}
        </div>
      )}
      {hint ? <p className={`mt-1 text-xs ${dark ? 'text-ds-shell-muted' : 'text-ds-secondary'}`}>{hint}</p> : null}
    </div>
  );
}
