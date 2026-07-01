// Badge — a small verdict pill (success=healthy / warning=watch / danger=at-risk /
// neutral=collecting). `dot` adds the leading status dot from the design target.
import type { ReactNode } from 'react';
import { badgeClasses, type BadgeVariant } from './tokens.ts';

export function Badge({ variant = 'neutral', children, dot = false }: { variant?: BadgeVariant; children: ReactNode; dot?: boolean }) {
  return (
    <span className={badgeClasses(variant)}>
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
