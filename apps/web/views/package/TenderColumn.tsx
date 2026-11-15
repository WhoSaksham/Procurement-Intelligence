'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { BenchmarkBullets } from '@/components/charts';
import { Cite } from '@/components/evidence/Cite';
import { NumberField } from '@/components/shell/fields';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_CRITERIA } from '@/data/reference';
import { pct, predict } from '@/lib/model';
import { useScenario } from '@/lib/store';
import type { CriteriaCheck, Criteria, Prediction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Expandable, StageHead } from './parts';

export function TenderColumn({ result, check }: { result: Prediction; check: CriteriaCheck }) {
  const pkg = useScenario((s) => s.pkg);
  const countries = useScenario((s) => s.countries);
  const criteria = useScenario((s) => s.criteria);
  const setCriteria = useScenario((s) => s.setCriteria);
  const applyBenchmark = useScenario((s) => s.applyBenchmark);
  const atBenchmark = useMemo(() => predict(pkg, countries, 0), [pkg, countries]);
  const specId = useId();
  const jvId = useId();

  const issues = check.findings.filter((f) => f.status !== 'ok');
  const flags = issues.filter((f) => f.status === 'flag').length;
  const minDays = pkg.method === 'RFB, open international' ? 42 : 21;
  const bullets = [
    { label: 'Turnover, × annual cash flow', value: criteria.turnover / check.annualCash, lo: 1.5, hi: 2.5, max: 5, fmt: (v: number) => `${v.toFixed(1)}×` },
    { label: 'Similar contracts required', value: criteria.similarContracts, lo: 0, hi: 2, max: 5, fmt: (v: number) => `${Math.round(v)}` },
    { label: 'Each similar contract, % of value', value: criteria.similarValuePct, lo: 0, hi: 80, max: 150, fmt: (v: number) => `${Math.round(v)}%` },
    { label: 'Bid security, % of value', value: criteria.bidSecurityPct, lo: 1, hi: 2, max: 5, fmt: (v: number) => `${v}%` },
    { label: 'Submission period, days', value: criteria.submissionDays, lo: minDays, hi: 90, max: 90, fmt: (v: number) => `${Math.round(v)}` },
  ];
  const num = (label: string, k: keyof Criteria, min: number, max: number, step = 1) => (
    <NumberField label={label} min={min} max={max} step={step} value={criteria[k] as number} onChange={(v) => setCriteria({ [k]: v })} />
  );

  return (
    <Card id="stage-tender" className="scroll-mt-28">
      <CardContent>
        <StageHead n={2} title="Tender design" tone={flags ? 'bad' : 'good'} status={flags ? `${flags} to fix` : 'Criteria in range'} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink">{pct(result.rebid.p)}</span>
            <span className="text-xs leading-tight text-ink-2">
              re-tender risk
              <br />
              {pct(atBenchmark.rebid.p)} at benchmark
            </span>
          </p>
          <Button size="sm" onClick={applyBenchmark} disabled={flags === 0}>
            {flags ? `Apply ${flags} fix${flags > 1 ? 'es' : ''}` : 'All in range'}
          </Button>
        </div>
        <BenchmarkBullets rows={bullets} />
        <ul>
          {issues.map((f) => (
            <Expandable
              key={f.id}
              icon={
                <span aria-hidden="true" className={cn('grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-surface', f.status === 'flag' ? 'bg-worse' : 'bg-watch')}>
                  {f.status === 'flag' ? '!' : '?'}
                </span>
              }
              title={
                <>
                  <strong className="font-semibold">{f.label}</strong> <span className="text-muted-ink">{f.value}</span>
                </>
              }
            >
              {f.advice}
              <Cite ids={f.cite} />
            </Expandable>
          ))}
        </ul>
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-procedure hover:underline">
            Edit draft criteria <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              {num('Turnover, US$ M', 'turnover', 0, 1000, 0.5)}
              {num('Bid security, %', 'bidSecurityPct', 0, 10, 0.5)}
              {num('Similar contracts', 'similarContracts', 0, 6)}
              {num('Each at least, %', 'similarValuePct', 0, 200, 5)}
              {num('Submission, days', 'submissionDays', 7, 120)}
              {num('Validity, days', 'validityDays', 30, 240)}
            </div>
            <label htmlFor={jvId} className="flex items-center gap-2 text-sm text-ink-2">
              <input id={jvId} type="checkbox" className="size-4 accent-[var(--procedure)]" checked={criteria.jvAllowed} onChange={(e) => setCriteria({ jvAllowed: e.target.checked })} />
              Joint ventures may bid
            </label>
            <div className="grid gap-1">
              <Label htmlFor={specId} className="text-[11.5px] text-muted-ink">
                Specification extract
              </Label>
              <Textarea id={specId} rows={4} value={criteria.specText} onChange={(e) => setCriteria({ specText: e.target.value })} className="bg-surface" />
            </div>
            {JSON.stringify(criteria) !== JSON.stringify(DEFAULT_CRITERIA) && (
              <button type="button" className="w-fit text-sm text-procedure hover:underline" onClick={() => setCriteria(DEFAULT_CRITERIA)}>
                Reset to the original draft
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
