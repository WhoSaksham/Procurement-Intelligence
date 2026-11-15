'use client';

import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { HBars } from '@/components/charts';
import { LAYER_CHIP } from '@/components/evidence/Cite';
import { ServiceHealth } from '@/components/graph/ServiceHealth';
import { PageHead } from '@/components/page-head';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LAYERS } from '@/data/sources';
import { cn } from '@/lib/utils';
import { FEEDS, ICR_TREE, LINKING, QUALITY, RUN, SAMPLE_CHUNK, STAGES } from './data';
import { cssPct } from '@/lib/format';

const BAR = { ledger: 'bg-ledger', procedure: 'bg-procedure', retrospective: 'bg-retro' } as const;
const Note = ({ children }: { children: React.ReactNode }) => <p className="mb-3 max-w-[80ch] text-sm text-muted-ink">{children}</p>;

export function PipelineView() {
  const [open, setOpen] = useState<string | null>('V. Lessons and recommendations');
  const total = RUN.reduce((t, r) => t + r.min, 0);
  const starts = RUN.map((_, i) => RUN.slice(0, i).reduce((t, r) => t + r.min, 0));

  return (
    <>
      <PageHead title="Data pipeline" lede="Three kinds of World Bank sources, turned into one set of linked, citable records." />
      <div className="mb-4">
        <ServiceHealth />
      </div>
      <Card>
        <CardContent>
          <Tabs defaultValue="sources">
            <TabsList variant="line" className="h-auto group-data-horizontal/tabs:h-auto flex-wrap justify-start">
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="stages">Processing</TabsTrigger>
              <TabsTrigger value="chunking">Document chunking</TabsTrigger>
              <TabsTrigger value="linking">Linking tenders to contracts</TabsTrigger>
              <TabsTrigger value="run">Weekly run</TabsTrigger>
              <TabsTrigger value="gaps">Missing data</TabsTrigger>
            </TabsList>

            <TabsContent value="sources" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feed</TableHead>
                    <TableHead>Layer</TableHead>
                    <TableHead className="hidden md:table-cell">Format</TableHead>
                    <TableHead className="hidden md:table-cell">Refresh</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <span className="sr-only">Volume, log scale</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FEEDS.map((f) => (
                    <TableRow key={f.name} className="align-top">
                      <TableCell className="whitespace-normal">
                        <span className="font-medium text-ink">{f.name}</span>
                        <code className="mt-0.5 block font-mono text-[11.5px] break-all text-muted-ink">{f.api}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={LAYER_CHIP[f.layer]}>
                          {LAYERS[f.layer].name}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{f.format}</TableCell>
                      <TableCell className="hidden md:table-cell">{f.cadence}</TableCell>
                      <TableCell className="text-right">{f.records}</TableCell>
                      <TableCell className="hidden w-32 lg:table-cell">
                        <span className="block h-2 rounded-full bg-sunk" title={`${f.records} (log scale)`}>
                          <span className={cn('block h-full rounded-full', BAR[f.layer])} style={{ width: cssPct((Math.log10(f.n) / Math.log10(2e6)) * 100) }} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="stages" className="mt-4">
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {STAGES.map((s, i) => (
                  <li key={s.name} className="rounded-lg border border-rule p-3">
                    <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-surface">{i + 1}</span>
                    <p className="mt-2 font-semibold text-ink">{s.name}</p>
                    <p className="text-sm text-ink-2">{s.detail}</p>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="chunking" className="mt-4">
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <Note>How a 112-page ICR is split. Chunks follow the document’s own structure, so citations point to a section, paragraph and page.</Note>
                  <ul className="grid gap-1">
                    {ICR_TREE.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          onClick={() => setOpen(open === s.name ? null : s.name)}
                          aria-expanded={open === s.name}
                          className="grid w-full grid-cols-[1rem_minmax(0,1fr)_4.5rem_5rem_2rem] items-center gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-sunk"
                        >
                          <ChevronRightIcon className={cn('size-4 text-muted-ink transition-transform', open === s.name && 'rotate-90')} aria-hidden="true" />
                          <span className="truncate text-ink">{s.name}</span>
                          <span className="text-xs text-muted-ink">pp. {s.pages}</span>
                          <span className="h-1.5 rounded-full bg-sunk" aria-hidden="true">
                            <span className="block h-full rounded-full bg-retro" style={{ width: cssPct((s.chunks / 88) * 100) }} />
                          </span>
                          <span className="text-right font-semibold">{s.chunks}</span>
                        </button>
                        {open === s.name && <p className="pb-2 pl-7 text-sm text-ink-2">{s.how}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <Note>Metadata stored with every chunk</Note>
                  <pre tabIndex={0} aria-label="Sample chunk metadata" className="overflow-x-auto rounded-lg bg-rail p-4 font-mono text-xs leading-relaxed text-rail-strong">{SAMPLE_CHUNK}</pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="linking" className="mt-4">
              <Note>Notices and contract awards share no key, so the labels the timeline model learns from are built here. Unlinked tenders are counted but never guessed.</Note>
              <HBars rows={LINKING} />
            </TabsContent>

            <TabsContent value="run" className="mt-4">
              <Note>Sunday 06:00, {total.toFixed(1)} minutes end to end. A failing check stops the job and alerts the owner.</Note>
              <ol className="grid gap-2">
                {RUN.map((r, i) => {
                  const left = (starts[i] / total) * 100;
                  return (
                    <li key={r.step} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_4rem] items-center gap-3 text-sm">
                      <span className="text-ink">
                        {r.step}
                        {'note' in r && r.note && <span className="text-xs text-muted-ink"> {r.note}</span>}
                      </span>
                      <span className="relative h-3 rounded bg-sunk">
                        <span className={cn('absolute inset-y-0 rounded', r.status === 'warn' ? 'bg-watch' : 'bg-good')} style={{ left: cssPct(left), width: cssPct((r.min / total) * 100) }} />
                      </span>
                      <span className="text-right text-muted-ink">{r.min.toFixed(1)} min</span>
                    </li>
                  );
                })}
              </ol>
            </TabsContent>

            <TabsContent value="gaps" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gap</TableHead>
                    <TableHead>Extent</TableHead>
                    <TableHead>Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {QUALITY.map(([g, e, h]) => (
                    <TableRow key={g} className="align-top">
                      <TableCell className="font-medium whitespace-normal">{g}</TableCell>
                      <TableCell className="whitespace-normal">{e}</TableCell>
                      <TableCell className="whitespace-normal">{h}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
