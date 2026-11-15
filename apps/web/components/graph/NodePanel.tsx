'use client';

import { CrosshairIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GraphNode, NodeDetail } from '@/lib/graph/types';

interface Props {
  detail: NodeDetail | undefined;
  labels: Record<string, GraphNode>;
  isFocus: boolean;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}

export function NodePanel({ detail, labels, isFocus, onSelect, onFocus }: Props) {
  if (!detail) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  const { node, neighbours, provenance } = detail;
  return (
    <Card data-testid="node-panel">
      <CardHeader>
        <CardDescription>{node.type}</CardDescription>
        <CardTitle className="font-serif text-lg leading-snug">{node.label}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        {!isFocus && (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => onFocus(node.id)}>
            <CrosshairIcon /> Centre graph here
          </Button>
        )}
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {Object.entries(node.attrs).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-ink">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <section>
          <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-muted-ink uppercase">Links ({neighbours.length})</h3>
          <ul className="grid gap-2">
            {neighbours.map((e) => {
              const out = e.source === node.id;
              const other = labels[out ? e.target : e.source];
              return (
                <li key={`${e.source}-${e.relation}-${e.target}`} className="grid gap-0.5 border-b border-rule pb-2 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button type="button" className="text-left font-medium text-procedure hover:underline" onClick={() => onSelect(other?.id ?? '')}>
                      {other?.label ?? (out ? e.target : e.source)}
                    </button>
                    <Badge variant="outline" className={e.confidence < 1 ? 'border-watch/40 text-watch' : 'text-muted-ink'}>
                      {e.confidence < 1 ? `Score ${e.confidence.toFixed(2)}` : 'Exact key'}
                    </Badge>
                  </div>
                  <span className="text-ink-2">
                    {out ? e.relation : `${e.relation} (incoming)`}
                    {e.role ? ` · ${e.role}` : ''}
                  </span>
                  <span className="text-xs text-muted-ink">{e.basis}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-muted-ink uppercase">Provenance ({provenance.length})</h3>
          <ol className="grid gap-2" data-testid="provenance">
            {provenance.map((p, i) => (
              <li key={`${p.source_id}-${i}`} className="rounded-md bg-sunk px-2.5 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{p.source_id}</span>
                  {p.confidence != null && <span className="text-xs text-muted-ink">confidence {p.confidence.toFixed(2)}</span>}
                </div>
                {p.locator && <div className="text-xs text-ink-2">{p.locator}</div>}
                {p.quote && <div className="mt-0.5 text-xs text-muted-ink">“{p.quote}”</div>}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-ink">Recorded as W3C PROV-O lineage by Semantica’s provenance manager.</p>
        </section>
      </CardContent>
    </Card>
  );
}
