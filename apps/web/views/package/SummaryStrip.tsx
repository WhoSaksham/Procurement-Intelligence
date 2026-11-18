'use client';

import { Loader2Icon } from 'lucide-react';
import { Cite } from '@/components/evidence/Cite';
import { NumberField } from '@/components/shell/fields';
import { useLoadedPackage } from '@/lib/api/package';
import { cssPct, pct, riskLevel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePackageContent } from './content';

const RISK_TONE: Record<string, string> = { High: 'text-worse', Elevated: 'text-watch', Low: 'text-good' };
const RISK_BAR: Record<string, string> = { High: 'bg-worse', Elevated: 'bg-watch', Low: 'bg-good' };

function Stat({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-rule bg-card p-3.5', className)}>
      {label && <p className="text-xs font-medium text-muted-ink">{label}</p>}
      {children}
    </div>
  );
}

export function SummaryStrip() {
  const { pkg, analysis, edit, updating } = useLoadedPackage();
  const risks = usePackageContent().data?.risks ?? [];
  const result = analysis.prediction;
  const onTime = result.onTime;
  const p80 = Math.round(result.p80);
  return (
    <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
      <Stat label="Expected signature">
        <p className="mt-1 text-2xl font-semibold text-ink">
          <span data-testid="p50">{Math.round(result.p50)}</span> <small className="text-sm font-normal text-muted-ink">days</small>
        </p>
        <p className="text-xs text-ink-2">
          80% sure by <span data-testid="p80">{p80}</span>
          <Cite ids={['ca1', 'wgi1']} />
        </p>
      </Stat>
      <Stat className={onTime < 0.5 ? 'border-worse/30 bg-worse-tint' : 'border-good/30 bg-good-tint'}>
        <NumberField label="Your plan, days" min={10} max={600} value={pkg.plannedDays} onChange={(plannedDays) => edit({ pkg: { plannedDays } })} className="[&_input]:mt-1 [&_input]:w-24 [&_input]:text-lg [&_input]:font-semibold" />
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          <span data-testid="on-time">{pct(onTime)} chance on time</span>
          {updating && <Loader2Icon aria-label="Updating" role="status" className="size-3 animate-spin text-muted-ink" />}
          {pkg.plannedDays < p80 && (
            <button type="button" className="font-semibold text-procedure-ink underline-offset-2 hover:underline" onClick={() => edit({ pkg: { plannedDays: p80 } })}>
              Use {p80}
            </button>
          )}
        </p>
      </Stat>
      {risks.map(({ key, name, cite }) => {
        const p = result[key].p;
        const level = riskLevel(p);
        return (
          <Stat key={key} label={name}>
            <p className="mt-1 text-2xl font-semibold text-ink" data-testid={`risk-${key}`}>
              {pct(p)}
            </p>
            <span className="mt-1 block h-1.5 rounded-full bg-sunk" aria-hidden="true">
              <span className={cn('block h-full rounded-full', RISK_BAR[level])} style={{ width: cssPct(Math.min(100, p * 100)) }} />
            </span>
            <p className="mt-1 text-xs">
              <span className={cn('font-semibold', RISK_TONE[level])}>{level}</span>
              <Cite ids={cite} />
            </p>
          </Stat>
        );
      })}
    </section>
  );
}
