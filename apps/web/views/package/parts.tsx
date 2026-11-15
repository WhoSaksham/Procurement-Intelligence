'use client';

import { ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function StageHead({ n, title, status, tone }: { n: number; title: string; status: string; tone: 'good' | 'bad' }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2.5">
      <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-surface">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <Badge variant="outline" className={cn('ml-auto', tone === 'bad' ? 'border-worse/30 bg-worse-tint text-worse' : 'border-good/30 bg-good-tint text-good')}>
        {status}
      </Badge>
    </header>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-2 font-sans text-xs font-semibold tracking-wide text-muted-ink uppercase">{children}</h3>;
}

/** A row that expands to show its explanation and sources. */
export function Expandable({ title, icon, children, after }: { title: ReactNode; icon?: ReactNode; children: ReactNode; after?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-rule py-2 last:border-0">
      <div className="flex items-start gap-1">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-start gap-1.5 text-left text-sm hover:text-procedure">
          <ChevronRightIcon className={cn('mt-0.5 size-4 shrink-0 text-muted-ink transition-transform', open && 'rotate-90')} aria-hidden="true" />
          {icon}
          <span className="min-w-0">{title}</span>
        </button>
        {after}
      </div>
      {open && <div className="mt-1.5 pl-6 text-sm text-ink-2">{children}</div>}
    </li>
  );
}
