'use client';

import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useReference, useSource } from '@/lib/api/queries';
import { useUi } from '@/lib/ui-store';
import { LAYER_CHIP, useCiteNumber } from './Cite';

/** The exact passage behind a citation, with the supporting span highlighted. */
export function EvidenceSheet() {
  const id = useUi((s) => s.evidence);
  const openEvidence = useUi((s) => s.openEvidence);
  const { data: s } = useSource(id);
  const layers = useReference().data?.layers;
  const citeNumber = useCiteNumber();
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && openEvidence(null)}>
      <SheetContent className="w-full gap-0 sm:max-w-[var(--drawer-w)]">
        {s && id === s.id && layers ? (
          <>
            <SheetHeader className="gap-2 pr-10">
              <Badge variant="outline" className={`w-fit ${LAYER_CHIP[s.layer]}`}>
                {layers[s.layer]?.name}: {layers[s.layer]?.question.toLowerCase()}
              </Badge>
              <SheetDescription>
                Source {citeNumber(id)} · {s.kind}
              </SheetDescription>
              <SheetTitle className="font-serif text-xl leading-snug">{s.title}</SheetTitle>
            </SheetHeader>
            <div className="grid gap-5 overflow-y-auto px-4 pb-6">
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-ink">Record</dt>
                <dd>{s.project}</dd>
                <dt className="text-muted-ink">Dated</dt>
                <dd>{s.date}</dd>
                <dt className="text-muted-ink">Location</dt>
                <dd>{s.locator}</dd>
              </dl>
              <blockquote className="border-l-4 border-rule-strong bg-sunk px-4 py-3 font-serif text-[15px] leading-relaxed text-ink-2">
                {s.before} <mark className="rounded-sm bg-watch-tint px-0.5 text-ink">{s.quote}</mark> {s.after}
              </blockquote>
              <p className="text-xs text-muted-ink">
                The highlighted span is the exact text the claim was checked against. Passages are retrieved from the indexed source, never generated.
              </p>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle className="font-serif text-xl">Loading source…</SheetTitle>
            <SheetDescription>Fetching the passage behind this citation.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
