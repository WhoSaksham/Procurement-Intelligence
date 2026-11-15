'use client';

import { SOURCES, sourceIndex } from '@/data/sources';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import type { LayerId } from '@/lib/types';

/** Stable citation number: the source's position in the evidence catalogue. */
export const citeNumber = (id: string) => sourceIndex.indexOf(id) + 1;

export const LAYER_CHIP: Record<LayerId, string> = {
  ledger: 'bg-ledger-tint text-ledger-ink border-ledger/30',
  procedure: 'bg-procedure-tint text-procedure-ink border-procedure/30',
  retrospective: 'bg-retro-tint text-retro-ink border-retro/30',
};

/** Numbered chips, coloured by evidence layer, that open the source passage. */
export function Cite({ ids, className }: { ids: string[]; className?: string }) {
  const open = useUi((s) => s.evidence);
  const openEvidence = useUi((s) => s.openEvidence);
  return (
    <span className={cn('ml-1 inline-flex gap-0.5 align-[0.1em]', className)}>
      {ids.map((id) => {
        const s = SOURCES[id];
        if (!s) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => openEvidence(open === id ? null : id)}
            aria-label={`Source ${citeNumber(id)}: ${s.kind}, ${s.title}`}
            title={`${s.kind}: ${s.title}`}
            className={cn(
              'inline-grid h-[18px] min-w-[18px] place-items-center rounded border px-1 text-[11px] leading-none font-semibold transition-shadow hover:shadow-sm',
              LAYER_CHIP[s.layer],
              open === id && 'ring-2 ring-ring/50',
            )}
          >
            {citeNumber(id)}
          </button>
        );
      })}
    </span>
  );
}
