'use client';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getHealth } from '@/lib/graph/client';
import { useAsync } from '@/lib/use-async';
import { SourceBadge } from './SourceBadge';

/** Live status of the graph service, as seen through the web app's API route. */
export function ServiceHealth() {
  const health = useAsync('health', getHealth);
  const s = health.data?.data.stats;
  const rows: [string, string][] = s
    ? [
        ['Nodes', String(s.nodes)],
        ['Links', String(s.edges)],
        ['Supplier names on award rows', String(s.suppliers_raw)],
        ['Resolved to firms', String(s.suppliers_canonical)],
        ['Joint ventures kept separate', String(s.joint_ventures)],
        ['Build time', `${s.build_ms} ms`],
      ]
    : [];
  return (
    <Card data-testid="service-health">
      <CardHeader>
        <CardTitle className="font-sans text-sm font-semibold">Graph service</CardTitle>
        <CardDescription>
          FastAPI + Semantica {health.data?.data.semantica_version ?? ''} · builds the graph in memory at startup
        </CardDescription>
        <CardAction>
          <SourceBadge source={health.data?.source} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {s ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-ink">{k}</dt>
                <dd className="text-lg font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Skeleton className="h-12 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
