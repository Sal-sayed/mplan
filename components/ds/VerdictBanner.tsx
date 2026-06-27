// VerdictBanner — the readiness result, in success / warning / danger tones.
import type { ComponentType, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { verdictClasses, type Verdict } from './tokens.ts';

const ICON: Record<Verdict, ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export function VerdictBanner({ variant, title, children }: { variant: Verdict; title: string; children?: ReactNode }) {
  const v = verdictClasses(variant);
  const Icon = ICON[variant];
  return (
    <div className={`flex items-start gap-3 rounded-ds border p-4 ${v.container}`}>
      <Icon size={20} className={`mt-0.5 shrink-0 ${v.accent}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${v.accent}`}>{title}</p>
        {children ? <p className="mt-0.5 text-sm text-ds-secondary">{children}</p> : null}
      </div>
    </div>
  );
}
