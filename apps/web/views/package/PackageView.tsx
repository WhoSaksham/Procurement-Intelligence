'use client';

import { useEffect } from 'react';
import { Cite } from '@/components/evidence/Cite';
import { PageHead } from '@/components/page-head';
import { Skeleton } from '@/components/ui/skeleton';
import { usePackage, useLoadedPackage } from '@/lib/api/package';
import { usePortfolio } from '@/lib/api/queries';
import { useUi } from '@/lib/ui-store';
import { usePackageContent } from './content';
import { DetailsTabs } from './DetailsTabs';
import { ExecutionColumn } from './ExecutionColumn';
import { PlanColumn } from './PlanColumn';
import { SignOff } from './SignOff';
import { SummaryStrip } from './SummaryStrip';
import { TenderColumn } from './TenderColumn';

/** Plan, tender design and execution for one package on one page. */
export function PackageView() {
  const { view, id } = usePackage();
  const content = usePackageContent();
  const portfolio = usePortfolio(id);
  if (!view || !content.data || !portfolio.data) {
    return (
      <div aria-busy="true" aria-label="Loading the package" className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  return <LoadedPackage />;
}

function LoadedPackage() {
  const { analysis, view } = useLoadedPackage();
  // The page arrives before its data, so the browser's own jump to #stage-… finds nothing; jump once loaded.
  useEffect(() => {
    if (window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, []);
  const portfolio = usePortfolio(view.id).data?.items ?? [];
  const contractId = useUi((s) => s.contract);
  const selected = portfolio.find((p) => p.id === contractId) ?? portfolio[0];
  const c = analysis.country;

  return (
    <>
      <PageHead title="Package" lede="Plan, tender and execution for this package on one page. Edit any field in the bar above and everything updates.">
        <SignOff />
      </PageHead>
      <SummaryStrip />
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
        <PlanColumn />
        <TenderColumn />
        {selected && <ExecutionColumn portfolio={portfolio} selected={selected} />}
      </div>
      {selected && <DetailsTabs selected={selected} />}
    </>
  );
}
