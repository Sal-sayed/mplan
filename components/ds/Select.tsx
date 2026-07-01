// Select — a styled dropdown for light cards (the "All metrics ▾" pattern and
// similar). Wraps a native <select> (accessible, real keyboard behaviour) with the
// design-system chrome + a chevron. Forwards value/onChange/etc. via props.
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

export function Select({ options, className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[] }) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        {...rest}
        className="w-full appearance-none rounded-lg border border-ds-line-strong bg-ds-panel py-2 pl-3 pr-8 text-sm font-semibold text-ds-ink transition hover:bg-ds-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ds-muted" />
    </div>
  );
}
