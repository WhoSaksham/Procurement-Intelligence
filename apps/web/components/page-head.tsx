import type { ReactNode } from 'react';

export function PageHead({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[72ch]">
        <h1 className="text-[1.75rem] leading-tight font-semibold text-ink">{title}</h1>
        {lede && <p className="mt-1.5 text-[15px] text-ink-2">{lede}</p>}
      </div>
      {children}
    </header>
  );
}
