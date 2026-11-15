import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Source } from '@/lib/graph/types';

/** Shows whether graph data came from the live Semantica service or the saved snapshot. */
export function SourceBadge({ source, className }: { source: Source | undefined; className?: string }) {
  if (!source) return null;
  const live = source === 'live';
  return (
    <Badge
      variant="outline"
      data-testid="graph-source"
      title={live ? 'Answered by the graph service (Semantica)' : 'Graph service unavailable: showing the saved snapshot'}
      className={cn('gap-1.5 font-semibold', live ? 'border-good/40 bg-good-tint text-good' : 'border-watch/40 bg-watch-tint text-watch', className)}
    >
      <span className={cn('size-1.5 rounded-full', live ? 'bg-good' : 'bg-watch')} aria-hidden="true" />
      {live ? 'Live · Semantica' : 'Snapshot'}
    </Badge>
  );
}
