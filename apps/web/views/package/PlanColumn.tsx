'use client';

import { useRef, useState } from 'react';
import { ComparablesStrip } from '@/components/charts';
import { Cite } from '@/components/evidence/Cite';
import { Card, CardContent } from '@/components/ui/card';
import { useLoadedPackage } from '@/lib/api/package';
import { Expandable, StageHead, SubTitle } from './parts';

/** While dragging the plan line, send at most one save per this many ms. */
const DRAG_SEND_MS = 150;

export function PlanColumn() {
  const { pkg, analysis, edit, flush } = useLoadedPackage();
  const [all, setAll] = useState(false);
  const lastSend = useRef(0);
  const result = analysis.prediction;
  const recs = analysis.recommendations;
  const cohort = analysis.comparables;
  const onTime = result.onTime;

  const onPlanned = (plannedDays: number) => {
    edit({ pkg: { plannedDays } });
    const now = Date.now();
    if (now - lastSend.current >= DRAG_SEND_MS) {
      lastSend.current = now;
      void flush();
    }
  };

  return (
    <Card id="stage-plan" className="scroll-mt-28">
      <CardContent>
        <StageHead n={1} title="Plan" tone={onTime < 0.5 ? 'bad' : 'good'} status={onTime < 0.5 ? `${Math.round(result.p80) - pkg.plannedDays} days short` : 'Schedule realistic'} />
        <ComparablesStrip sample={analysis.sample} planned={pkg.plannedDays} onPlanned={onPlanned} onCommit={() => void flush()} />
        <p className="mt-2 text-[13px] text-ink-2">
          {cohort.widened ? (
            <>
              Only {cohort.close} close comparables, so the cohort is widened to {cohort.n} {pkg.category.toLowerCase()} packages in {analysis.country.region}.
            </>
          ) : (
            <>Based on {cohort.n} comparable packages.</>
          )}{' '}
          Simple benchmark for this method and category: {Math.round(analysis.benchmarkDays)} days.
          <Cite ids={['ca1']} />
        </p>
        <SubTitle>Next actions</SubTitle>
        <ul>
          {(all ? recs : recs.slice(0, 4)).map((r) => (
            <Expandable key={r.title} title={r.title} after={<Cite ids={r.cite} />}>
              {r.body}
            </Expandable>
          ))}
        </ul>
        {recs.length > 4 && (
          <button type="button" className="mt-1 text-sm font-medium text-procedure hover:underline" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${recs.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
