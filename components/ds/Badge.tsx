// Badge — a small pill for labels like "no code" (success) / "needs dev" (warning).
import type { ReactNode } from 'react';
import { badgeClasses, type BadgeVariant } from './tokens.ts';

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={badgeClasses(variant)}>{children}</span>;
}
