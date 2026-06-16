'use client';

// Light/dark theme toggle. The theme is applied by a tiny inline script in the
// root layout (before paint, no flash) which adds/removes `html.light` based on
// localStorage 'theme' (falling back to the OS preference, then dark). This
// button flips that class + persists the choice. Dark is the default.
//
// The current theme is read with useSyncExternalStore so it stays in sync with
// the DOM class without a setState-in-effect (SSR snapshot is always 'dark',
// matching the server-rendered default).

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  // Server + first client paint render the default ('dark'); the observer syncs
  // the real value after mount.
  const theme = useSyncExternalStore<Theme>(subscribe, getSnapshot, () => 'dark');

  const toggle = () => {
    const next: Theme = getSnapshot() === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('light', next === 'light');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage blocked — the choice just won't persist */
    }
  };

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-overlay text-ink transition hover:bg-overlay-strong ${className}`}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
