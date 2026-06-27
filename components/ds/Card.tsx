// Card — white surface, soft hairline border, 12px radius (rounded-ds). The base
// surface for the new design system. Presentational; padding is the default p-5 and
// can be overridden/extended via className.
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-ds border border-ds-line bg-ds-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  );
}
