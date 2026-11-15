'use client';

import { Cite } from '@/components/evidence/Cite';
import { PageHead } from '@/components/page-head';
import { country } from '@/lib/model';
import { useUi } from '@/lib/ui-store';
import { usePlan } from '@/lib/use-plan';
import { DetailsTabs } from './DetailsTabs';
import { ExecutionColumn } from './ExecutionColumn';
import { PlanColumn } from './PlanColumn';
import { SignOff } from './SignOff';
import { SummaryStrip } from './SummaryStrip';
import { TenderColumn } from './TenderColumn';

/** Plan, tender design and execution for one package on one page. */
export function PackageView() {
  const { pkg, countries, check, result, best, portfolio } = usePlan();
  const contractId = useUi((s) => s.contract);
  const selected = portfolio.find((p) => p.id === contractId) ?? portfolio[0];
  const c = country(pkg.country, countries);

  return (
    <>
      <PageHead title="Package" lede="Plan, tender and execution for this package on one page. Edit any field in the bar above and everything updates.">
        <SignOff />
      </PageHead>
      <SummaryStrip result={result} />
      {c.cpiaImputed && (
        <p className="-mt-2 mb-4 text-sm text-ink-2">
          {c.name} has no CPIA score; a CPIA-equivalent from WGI regulatory quality is used and marked as imputed.
          <Cite ids={['wgi1']} />
        </p>
      )}
      {c.custom && (
        <p className="-mt-2 mb-4 text-sm text-ink-2">
          {c.name} uses governance scores you entered (CPIA {c.cpia}, regulatory quality {c.rq}th percentile{c.fcv ? ', fragile setting' : ''}). Edit them under More.
        </p>
      )}
      <div className="mb-5 grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PlanColumn result={result} />
        <TenderColumn result={result} check={check} />
        <ExecutionColumn portfolio={portfolio} selected={selected} />
      </div>
      <DetailsTabs result={result} stringency={check.stringency} best={best} selected={selected} />
    </>
  );
}
