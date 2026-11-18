'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { usePackage } from '@/lib/api/package';
import { usePortfolio } from '@/lib/api/queries';

// MapLibre needs the browser (WebGL, workers), so the map loads client-side only.
const SiteMap = dynamic(() => import('./SiteMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-[calc(100dvh-180px)] min-h-[480px] w-full rounded-none" />,
});

export function MapView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { id } = usePackage();
  const portfolio = usePortfolio(id).data?.items;
  if (!portfolio) return <Skeleton className="h-[calc(100dvh-180px)] min-h-[480px] w-full rounded-none" />;
  return (
    <SiteMap
      contractId={params.get('contract')}
      portfolio={portfolio}
      onContract={(id) => router.replace(`${pathname}?contract=${id}`, { scroll: false })}
    />
  );
}
