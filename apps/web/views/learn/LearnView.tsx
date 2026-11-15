'use client';

import { CheckIcon, DotIcon } from 'lucide-react';
import { useState } from 'react';
import { Sparkline, TargetBar } from '@/components/charts';
import { LAYER_CHIP } from '@/components/evidence/Cite';
import { PageHead } from '@/components/page-head';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LAYERS } from '@/data/sources';
import { cn } from '@/lib/utils';
import { HEALTH, INCOMING, INITIAL_EVENTS, KPIS, PHASES, type LearnEvent } from './data';

const BORDER = { ledger: 'border-l-ledger', procedure: 'border-l-procedure', retrospective: 'border-l-retro' } as const;

export function LearnView() {
  const [events, setEvents] = useState<LearnEvent[]>(INITIAL_EVENTS);
  const [next, setNext] = useState(0);
  const simulate = () => {
    if (next >= INCOMING.length) return;
    setEvents((e) => [{ ...INCOMING[next], when: '2025-11-01', fresh: true }, ...e.map((x) => ({ ...x, fresh: false }))]);
    setNext((n) => n + 1);
  };

  return (
    <>
      <PageHead title="Learn" lede="New records flow back into the indexes and models. Each event shows exactly what it changed.">
        <Button variant="outline" size="sm" onClick={simulate} disabled={next >= INCOMING.length}>
          {next >= INCOMING.length ? 'No more sample events' : 'Receive next event'}
        </Button>
      </PageHead>
      <Card>
        <CardContent>
          <Tabs defaultValue="events">
            <TabsList variant="line" className="h-auto group-data-horizontal/tabs:h-auto flex-wrap justify-start">
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="kpis">Pilot KPIs</TabsTrigger>
              <TabsTrigger value="health">Model health</TabsTrigger>
              <TabsTrigger value="rollout">Rollout</TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="mt-4">
              <ol className="grid gap-3">
                {events.map((ev) => (
                  <li key={ev.title} className={cn('rounded-lg border border-l-4 border-rule p-3', BORDER[ev.layer], ev.fresh && 'bg-watch-tint')}>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-ink">
                      <Badge variant="outline" className={LAYER_CHIP[ev.layer]}>
                        {LAYERS[ev.layer].name}
                      </Badge>
                      <time>{ev.when}</time>
                      {ev.fresh && <span className="font-semibold text-watch">New</span>}
                    </p>
                    <p className="mt-1 font-semibold text-ink">{ev.title}</p>
                    <dl className="mt-2 grid gap-1 text-sm">
                      {ev.updates.map(([k, v]) => (
                        <div key={k} className="grid gap-x-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                          <dt className="text-muted-ink">{k}</dt>
                          <dd className="text-ink-2">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="kpis" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measure</TableHead>
                    <TableHead className="text-right">Baseline</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Month 6</TableHead>
                    <TableHead>Months 1–6</TableHead>
                    <TableHead>Baseline to target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {KPIS.map((k) => (
                    <TableRow key={k.name}>
                      <TableCell className="font-medium whitespace-normal">{k.name}</TableCell>
                      <TableCell className="text-right">{k.base}</TableCell>
                      <TableCell className="text-right">{k.target}</TableCell>
                      <TableCell className="text-right font-semibold">{k.now}</TableCell>
                      <TableCell>
                        <Sparkline values={k.series} target={k.tgt} better={k.better as 'up' | 'down'} />
                      </TableCell>
                      <TableCell>
                        <TargetBar base={k.series[0]} now={k.series[k.series.length - 1]} target={k.tgt} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="fine">Recall and precision are measured on 220 packages where specialists listed the risk factors that actually materialised. The dashed line is the target.</p>
            </TabsContent>

            <TabsContent value="health" className="mt-4">
              <ul className="grid gap-2">
                {HEALTH.map((h) => (
                  <li key={h.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-rule pb-2 text-sm last:border-0 md:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,1fr)]">
                    <span aria-hidden="true" className={cn('grid size-5 place-items-center rounded-full', h.ok ? 'bg-good-tint text-good' : 'bg-watch-tint text-watch')}>
                      {h.ok ? <CheckIcon className="size-3" /> : <DotIcon className="size-4" />}
                    </span>
                    <span className="font-medium text-ink">{h.name}</span>
                    <span className="font-semibold text-ink max-md:col-start-2">{h.value}</span>
                    <span className="text-muted-ink max-md:col-start-2">{h.ok ? h.limit : `${h.limit}: retrain scheduled`}</span>
                  </li>
                ))}
              </ul>
              <p className="fine">
                Updates are ingested within 24 hours, resolved into the graph, re-indexed (changed chunks only), labelled for the risk models, and re-checked against open conflicts. A
                challenger model replaces the current one only if it wins on the last 12 months of held-out awards and a procurement lead signs off.
              </p>
            </TabsContent>

            <TabsContent value="rollout" className="mt-4">
              <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {PHASES.map((p, i) => (
                  <li key={p.name} className={cn('rounded-lg border p-3', p.current ? 'border-ink bg-sunk' : 'border-rule')}>
                    <p className="text-xs font-semibold text-muted-ink">
                      Phase {i}, {p.months}
                      {p.current && ', in progress'}
                    </p>
                    <p className="mt-1 font-semibold text-ink">{p.name}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-2">
                      {p.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
