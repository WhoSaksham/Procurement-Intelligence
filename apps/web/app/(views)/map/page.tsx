import { Suspense } from 'react';
import { MapView } from '@/components/map/MapView';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Site map · Procurement Intelligence' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-180px)] min-h-[480px] w-full" />}>
      <MapView />
    </Suspense>
  );
}
