'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHead } from '@/components/page-head';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAnalytics, getClusters, getFullGraph, getGraph, getNode, GraphError } from '@/lib/graph/client';
import { DEFAULT_FOCUS, DEFAULT_HOPS } from '@/lib/graph/fallback';
import type { GraphNode } from '@/lib/graph/types';
import { useAsync } from '@/lib/use-async';
import { GraphCanvas, GraphLegend } from './GraphCanvas';
import { MostConnected } from './MostConnected';
import { NodePanel } from './NodePanel';
import { NodeSearch } from './NodeSearch';
import { SourceBadge } from './SourceBadge';
import { SupplierResolution } from './SupplierResolution';

const SCHEMA = [
  ['Project', 'Project ID', 'Country, sector codes, commitment, E&S risk, status, dates'],
  ['Contract', 'Notice number + lot', 'Value, method, review type, category, signature date, amendments'],
  ['Supplier', 'Canonical supplier ID', 'Name variants, country of registration, award history'],
  ['Joint venture', 'Award row', 'Members with lead or member role'],
  ['Document', 'Document ID', 'Type, date, Project ID, version, superseded by'],
  ['Passage', 'Document ID + section path', 'Page, text, table flag, embedding, topics'],
  ['Indicator', 'Country + year + series', 'CPIA cluster scores, WGI percentiles, imputed flag'],
];

export function GraphView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const focus = params.get('focus') ?? DEFAULT_FOCUS;
  const [hops, setHops] = useState(DEFAULT_HOPS);
  const [picked, setPicked] = useState<{ focus: string; id: string } | null>(null);
  const [byCommunity, setByCommunity] = useState(false);
  const selected = picked?.focus === focus ? picked.id : focus;

  const setFocus = (id: string) => router.replace(id === DEFAULT_FOCUS ? pathname : `${pathname}?focus=${encodeURIComponent(id)}`, { scroll: false });

  const graph = useAsync(`${focus}|${hops}`, () => getGraph(focus, hops));
  const full = useAsync('full', getFullGraph);
  const analytics = useAsync('analytics', getAnalytics);
  const clusters = useAsync('clusters', getClusters);
  const detail = useAsync(selected, () => getNode(selected));

  // Unknown node in the URL: say so and return to the last good focus.
  const notFound = graph.error instanceof GraphError && graph.error.status === 404;
  useEffect(() => {
    if (!notFound) return;
    toast.error('Node not found', { description: `No node with ID “${focus}”. Showing the closest precedent instead.` });
    router.replace(pathname, { scroll: false });
  }, [notFound, focus, pathname, router]);

  const shown = graph.data ?? graph.previous;
  const labels = useMemo(() => Object.fromEntries((full.data?.data.nodes ?? shown?.data.nodes ?? []).map((n) => [n.id, n])) as Record<string, GraphNode>, [full.data, shown]);
  const source = graph.data?.source ?? full.data?.source;

  return (
    <>
      <PageHead title="Knowledge graph" lede="Records and passages joined by shared keys, or by scored matching where no key exists. Built live by the graph service with Semantica.">
        <SourceBadge source={source} />
      </PageHead>

      <Tabs defaultValue="graph">
        <TabsList variant="line" className="h-auto group-data-horizontal/tabs:h-auto flex-wrap justify-start">
          <TabsTrigger value="graph">Graph</TabsTrigger>
          <TabsTrigger value="schema">Entities and keys</TabsTrigger>
          <TabsTrigger value="names">Supplier name resolution</TabsTrigger>
        </TabsList>

        <TabsContent value="graph" className="mt-3">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* The graph card stretches to the side column's height and the canvas fills it. */}
            <Card className="min-w-0">
              <CardContent className="flex h-full min-h-0 flex-col">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <NodeSearch nodes={full.data?.data.nodes ?? []} onPick={setFocus} />
                  <div className="flex items-center gap-2">
                    <Label htmlFor="hops" className="text-sm text-ink-2">
                      Hops
                    </Label>
                    <Select value={String(hops)} onValueChange={(v) => setHops(Number(v))}>
                      <SelectTrigger id="hops" size="sm" className="w-16 bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="communities" checked={byCommunity} onCheckedChange={setByCommunity} />
                    <Label htmlFor="communities" className="text-sm text-ink-2">
                      Group by community
                    </Label>
                  </div>
                  <span className="ml-auto text-xs text-muted-ink" data-testid="graph-focus">
                    Centred on <strong className="text-ink">{labels[shown?.data.focus ?? focus]?.label ?? focus}</strong>
                  </span>
                </div>
                {shown ? (
                  <GraphCanvas
                    nodes={shown.data.nodes}
                    edges={shown.data.edges}
                    focus={shown.data.focus ?? focus}
                    selected={selected}
                    byCommunity={byCommunity}
                    onSelect={(id) => setPicked({ focus, id })}
                  />
                ) : (
                  <Skeleton className="h-[420px] w-full" />
                )}
                <GraphLegend byCommunity={byCommunity} />
              </CardContent>
            </Card>
            <div className="grid content-start gap-4">
              <NodePanel
                detail={detail.data?.data ?? detail.previous?.data}
                labels={labels}
                isFocus={selected === focus}
                onSelect={(id) => setPicked({ focus, id })}
                onFocus={setFocus}
              />
              <MostConnected analytics={analytics.data?.data} labels={labels} onFocus={setFocus} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="mt-3">
          <Card>
            <CardContent className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Main attributes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SCHEMA.map(([e, k, a]) => (
                    <TableRow key={e}>
                      <TableCell className="font-medium">{e}</TableCell>
                      <TableCell>{k}</TableCell>
                      <TableCell className="whitespace-normal">{a}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="max-w-[80ch] text-sm text-muted-ink">
                Links without a shared key are scored on Project ID mentions in text, sector codes, temporal proximity and embedding similarity. Below 0.75 a link is
                held for review instead of being added. Every node and link carries its source in Semantica’s provenance store.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="names" className="mt-3">
          <Card>
            <CardContent>
              <SupplierResolution clusters={clusters.data?.data} labels={labels} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
