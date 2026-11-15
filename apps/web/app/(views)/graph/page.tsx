import { Suspense } from 'react';
import { GraphView } from '@/components/graph/GraphView';
import { PageHead } from '@/components/page-head';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Knowledge graph · Procurement Intelligence' };

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <PageHead title="Knowledge graph" lede="Records and passages joined by shared keys, or by scored matching where no key exists." />
          <Skeleton className="h-[480px] w-full" />
        </>
      }
    >
      <GraphView />
    </Suspense>
  );
}
