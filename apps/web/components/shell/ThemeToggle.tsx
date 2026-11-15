'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

// Both labels render; CSS shows the one for the current theme, so the server
// and browser output match and the accessible name follows what is visible.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="flex items-center gap-2 rounded-md py-1 text-left text-rail-muted hover:text-rail-strong"
    >
      <span className="flex items-center gap-2 dark:hidden">
        <MoonIcon className="size-3.5" aria-hidden="true" /> Dark theme
      </span>
      <span className="hidden items-center gap-2 dark:flex">
        <SunIcon className="size-3.5" aria-hidden="true" /> Light theme
      </span>
    </button>
  );
}
