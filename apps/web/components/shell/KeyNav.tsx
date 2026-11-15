'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isTyping, VIEWS } from './views';

/** Number keys 1–6 switch views, except while typing in a field. */
export function KeyNav() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      const view = VIEWS.find((v) => v.key === e.key);
      if (view) router.push(view.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return null;
}
