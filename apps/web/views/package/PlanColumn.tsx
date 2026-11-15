'use client';

import { useMemo, useState } from 'react';
import { ComparablesStrip } from '@/components/charts';
import { Cite } from '@/components/evidence/Cite';
import { Card, CardContent } from '@/components/ui/card';
import { benchmarkDays, cohortSample, comparables, country } from '@/lib/model';
import { recommendations } from '@/lib/recommend';
import { useScenario } from '@/lib/store';
import type { Prediction } from '@/lib/types';
import { Expandable, StageHead, SubTitle } from './parts';

export function PlanColumn({ result }: { result: Prediction }) {
  const pkg = useScenario((s) => s.pkg);
  const countries = useScenario((s) => s.countries);
  const setPkg = useScenario((s) => s.setPkg);
  const [all, setAll] = useState(false);
  const sample = useMemo(() => cohortSample(pkg, countries), [pkg, countries]);
  const recs = useMemo(() => recommendations(pkg, result, countries), [pkg, result, countries]);
  const cohort = comparables(pkg, countries);
  const c = country(pkg.country, countries);
  const onTime = result.cdf(pkg.plannedDays);

  return (
    <Card id="stage-plan" className="scroll-mt-28">
      <CardContent>
        <StageHead n={1} title="Plan" tone={onTime < 0.5 ? 'bad' : 'good'} status={onTime < 0.5 ? `${Math.round(result.p80) - pkg.plannedDays} days short` : 'Schedule realistic'} />
        <ComparablesStrip sample={sample} planned={pkg.plannedDays} onPlanned={(plannedDays) => setPkg({ plannedDays })} />
        <p className="mt-2 text-[13px] text-ink-2">
          {cohort.widened ? (
            <>
              Only {cohort.close} close comparables, so the cohort is widened to {cohort.n} {pkg.category.toLowerCase()} packages in {c.region}.
            </>
          ) : (
            <>Based on {cohort.n} comparable packages.</>
          )}{' '}
          Simple benchmark for this method and category: {Math.round(benchmarkDays(pkg))} days.
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
