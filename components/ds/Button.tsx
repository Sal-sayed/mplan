// Button — primary (solid accent, the ONE primary action per screen) or secondary
// (quiet, bordered). Forwards native button props (onClick, disabled, type, …).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClasses, type ButtonVariant } from './tokens.ts';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = 'secondary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`${buttonClasses(variant)} ${className}`} {...rest}>
      {children}
    </button>
  );
}
