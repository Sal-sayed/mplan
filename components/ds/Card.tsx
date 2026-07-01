// Card — a LIGHT (white) surface that floats on the dark shell: 16px radius, a soft
// drop shadow, and a hairline border. The base surface for the design system.
// Presentational; padding defaults to p-5 and can be overridden via className.
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ds-line bg-ds-card p-5 text-ds-ink shadow-[0_8px_26px_rgba(0,0,0,0.22)] ${className}`}>
      {children}
    </div>
  );
}
