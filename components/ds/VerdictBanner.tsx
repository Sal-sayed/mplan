// VerdictBanner — the "overall health" card from the design target: an optional
// kicker, a colored icon tile, the verdict title, and a reason line. Tones:
// success=healthy / warning=watch / danger=at-risk. Back-compatible: called
// without `kicker` it's a simple verdict banner.
import type { ComponentType, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { verdictClasses, type Verdict } from './tokens.ts';

const ICON: Record<Verdict, ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export function VerdictBanner({
  variant,
  title,
  kicker,
  children,
}: {
  variant: Verdict;
  title: string;
  kicker?: string;
  children?: ReactNode;
}) {
  const v = verdictClasses(variant);
  const Icon = ICON[variant];
  return (
    <div className={`rounded-2xl border p-5 ${v.container}`}>
      {kicker ? <span className={`text-[11px] font-bold uppercase tracking-wider ${v.accent}`}>{kicker}</span> : null}
      <div className={`flex items-center gap-3 ${kicker ? 'mt-3' : ''}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ds-card ${v.accent}`}>
          <Icon size={22} />
        </span>
        <p className={`text-lg font-bold leading-tight ${v.accent}`}>{title}</p>
      </div>
      {children ? <p className="mt-3 text-sm leading-relaxed text-ds-secondary">{children}</p> : null}
    </div>
  );
}
