'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Analytics, GraphNode } from '@/lib/graph/types';
import { cssPct } from '@/lib/format';

export function MostConnected({ analytics, labels, onFocus }: { analytics: Analytics | undefined; labels: Record<string, GraphNode>; onFocus: (id: string) => void }) {
  const top = (analytics?.centrality ?? []).filter((c) => labels[c.id]).slice(0, 8);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-sm font-semibold">Most connected</CardTitle>
        <CardDescription>Degree centrality across the whole graph</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-1.5" data-testid="most-connected">
          {top.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => onFocus(c.id)} className="group grid w-full grid-cols-[1.25rem_minmax(0,1fr)_4rem] items-center gap-2 text-left text-sm">
                <span className="text-xs text-muted-ink">{i + 1}</span>
                <span className="truncate text-ink group-hover:text-procedure group-hover:underline">
                  {labels[c.id].label}
                  <span className="ml-1.5 text-xs text-muted-ink">{labels[c.id].type}</span>
                </span>
                <span className="h-1.5 rounded-full bg-sunk" aria-hidden="true">
                  <span className="block h-full rounded-full bg-procedure" style={{ width: cssPct(c.score * 100) }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
