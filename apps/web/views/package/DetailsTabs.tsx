'use client';

import { useMemo } from 'react';
import { AgentTrace } from '@/components/AgentTrace';
import { DisbursementPeers, DriverBars, DurationCurve, HBars, MethodRange, MilestoneChart, ProgressCurve, RatingChart } from '@/components/charts';
import { Cite } from '@/components/evidence/Cite';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ISR_HISTORY } from '@/data/reference';
import { cohortSample, comparables, compareMethods } from '@/lib/model';
import { useScenario } from '@/lib/store';
import type { Contract, Prediction } from '@/lib/types';
import { useUi } from '@/lib/ui-store';
import { ACTUAL, CONFLICT, PAST_SPECS, PEERS, PRECEDENTS, RISKS, traceSteps, weight, WINNERS } from './data';
import { SubTitle } from './parts';
import { cssPct } from '@/lib/format';

const Note = ({ children }: { children: React.ReactNode }) => <p className="mb-3 max-w-[80ch] text-sm text-muted-ink">{children}</p>;

export function DetailsTabs({ result, stringency, best, selected }: { result: Prediction; stringency: number; best: string | null; selected: Contract }) {
  const pkg = useScenario((s) => s.pkg);
  const countries = useScenario((s) => s.countries);
  const setPkg = useScenario((s) => s.setPkg);
  const openEvidence = useUi((s) => s.openEvidence);
  const sample = useMemo(() => cohortSample(pkg, countries), [pkg, countries]);
  const options = useMemo(() => compareMethods(pkg, countries, stringency), [pkg, countries, stringency]);
  const cohort = comparables(pkg, countries);
  const total = CONFLICT.reduce((s, r) => s + weight(r), 0);
  const forUnsat = CONFLICT.filter((r) => r.src !== 'isr1').reduce((s, r) => s + weight(r), 0);

  const tabs = [
    {
      id: 'approach',
      label: 'Market approach',
      content: (
        <>
          <MethodRange options={options} best={best} />
          <div className="mt-4 flex flex-wrap gap-2">
            {options
              .filter((o) => !o.current && !o.limit)
              .map((o) => (
                <Button key={o.method} variant="outline" size="sm" onClick={() => setPkg({ method: o.method })}>
                  Use {o.method}
                </Button>
              ))}
          </div>
        </>
      ),
    },
    { id: 'curve', label: 'Signature curve', content: <DurationCurve result={result} sample={sample} planned={pkg.plannedDays} W={1000} H={280} /> },
    {
      id: 'drivers',
      label: 'Risk drivers',
      content: (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <SubTitle>Days to signature</SubTitle>
            <DriverBars compact drivers={result.timelineDrivers.map((d) => ({ label: d.label, v: d.pct }))} unit="%" />
          </div>
          {RISKS.map(({ key, name }) => (
            <div key={key}>
              <SubTitle>{name}</SubTitle>
              <DriverBars compact drivers={result[key].drivers.slice(0, 5).map((d) => ({ label: d.label, v: d.pp }))} unit=" pts" />
            </div>
          ))}
        </div>
      ),
    },
    { id: 'progress', label: `Progress, ${selected.id}`, content: <ProgressCurve contract={selected} W={1000} H={280} /> },
    {
      id: 'milestones',
      label: `Milestones, ${selected.id}`,
      content: selected.milestones.length ? <MilestoneChart milestones={selected.milestones} W={1000} /> : <Note>No milestones recorded for this contract.</Note>,
    },
    {
      id: 'disbursement',
      label: 'Disbursement vs peers',
      content: (
        <>
          <Note>
            Parent project P171204 at its mid-term review, against similar rural transport projects at the same age. A gap this size starts a conversation; lumpy payments can explain
            some of it.
            <Cite ids={['fin1']} />
          </Note>
          <DisbursementPeers actual={ACTUAL} peers={PEERS} months={72} W={1000} H={280} />
        </>
      ),
    },
    {
      id: 'winners',
      label: 'Who wins',
      content: (
        <>
          <Note>
            Winners of the {cohort.n} comparable awards. Domestic firms won most lots under US$5M; foreign firms concentrate on larger single-lot packages.
            <Cite ids={['ca3']} />
          </Note>
          <HBars rows={WINNERS} unit=" wins" />
        </>
      ),
    },
    {
      id: 'conflict',
      label: 'Evidence conflict',
      content: (
        <>
          <Note>Supervision rated the parent project Satisfactory through 2023; the completion report rates the same period Moderately Unsatisfactory. Click a point to read the source.</Note>
          <RatingChart history={ISR_HISTORY} onPick={openEvidence} />
          <div className="my-4 rounded-lg border-l-4 border-retro bg-retro-tint p-3 text-sm">
            <p className="font-semibold text-ink">Resolved toward Moderately Unsatisfactory, {Math.round((forUnsat / total) * 100)}% of evidence weight</p>
            <p className="text-ink-2">
              The ISR rating is kept as the record of what supervisors believed at the time. The independent review explains the gap: unpaid certificates built up without being
              reflected in ratings.
              <Cite ids={['ieg2', 'isr2']} />
            </p>
          </div>
          <div className="weights" aria-label="Evidence weights">
            {CONFLICT.map((r) => (
              <div key={r.src} className="weight-row">
                <span className="w-label">
                  {r.label}
                  <Cite ids={[r.src]} />
                </span>
                <span className="w-says">{r.says}</span>
                <span className="w-track">
                  <span style={{ width: cssPct((weight(r) / total) * 100) }} className={r.src === 'isr1' ? 'is-minor' : ''} />
                </span>
                <span className="w-val">{Math.round((weight(r) / total) * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="fine">Weight is authority × independence × hindsight × corroboration. Ratings are never averaged; a side must pass 65% of weight or the question is reported as contested.</p>
        </>
      ),
    },
    {
      id: 'precedents',
      label: 'Precedents',
      content: (
        <>
          <ul className="grid gap-4 md:grid-cols-3">
            {PRECEDENTS.map((p) => (
              <li key={p.name} className="grid content-start gap-1 text-sm">
                <span className="h-1.5 rounded-full bg-sunk" role="img" aria-label={`Similarity ${Math.round(p.match * 100)}%`}>
                  <span className="block h-full rounded-full bg-procedure" style={{ width: cssPct(p.match * 100) }} />
                </span>
                <p className="font-semibold text-ink">
                  {p.name} <span className="font-normal text-muted-ink">{p.id}</span>
                </p>
                <p className="text-muted-ink">{p.why}</p>
                <p className="text-ink-2">
                  {p.outcome}
                  <Cite ids={p.cite} />
                </p>
              </li>
            ))}
          </ul>
          <SubTitle>Similar past bidding documents</SubTitle>
          <ul className="grid gap-2 text-sm">
            {PAST_SPECS.map((s) => (
              <li key={s.title} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
                <span className="font-semibold text-procedure">{Math.round(s.sim * 100)}%</span>
                <span className="text-ink-2">
                  <strong className="text-ink">{s.title}</strong> {s.result}
                  <Cite ids={s.cite} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    { id: 'trace', label: 'How this was built', content: <AgentTrace steps={traceSteps(pkg, countries)} /> },
  ];

  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0">
        <Tabs defaultValue="approach" className="min-w-0">
          <TabsList variant="line" className="h-auto group-data-horizontal/tabs:h-auto w-full flex-wrap justify-start">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mt-4 min-w-0">
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
