'use client';

import { useSourceIndex } from '@/lib/api/queries';
import type { LayerId } from '@/lib/types';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/** Stable citation number: the source's position in the evidence catalogue (from the API). */
export function useCiteNumber() {
  const items = useSourceIndex().data?.items;
  return (id: string) => (items ? items.findIndex((s) => s.id === id) + 1 : 0);
}

export const LAYER_CHIP: Record<LayerId, string> = {
  ledger: 'bg-ledger-tint text-ledger-ink border-ledger/30',
  procedure: 'bg-procedure-tint text-procedure-ink border-procedure/30',
  retrospective: 'bg-retro-tint text-retro-ink border-retro/30',
};

/** Numbered chips, coloured by evidence layer, that open the source passage. */
export function Cite({ ids, className }: { ids: string[]; className?: string }) {
  const open = useUi((s) => s.evidence);
  const openEvidence = useUi((s) => s.openEvidence);
  const items = useSourceIndex().data?.items;
  if (!items) return null;
  return (
    <span className={cn('ml-1 inline-flex gap-0.5 align-[0.1em]', className)}>
      {ids.map((id) => {
        const n = items.findIndex((x) => x.id === id) + 1;
        const s = items[n - 1];
        if (!s) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => openEvidence(open === id ? null : id)}
            aria-label={`Source ${n}: ${s.kind}, ${s.title}`}
            title={`${s.kind}: ${s.title}`}
            className={cn(
              'inline-grid h-[18px] min-w-[18px] place-items-center rounded border px-1 text-[11px] leading-none font-semibold transition-shadow hover:shadow-sm',
              LAYER_CHIP[s.layer],
              open === id && 'ring-2 ring-ring/50',
            )}
          >
            {n}
          </button>
        );
      })}
    </span>
  );
}
