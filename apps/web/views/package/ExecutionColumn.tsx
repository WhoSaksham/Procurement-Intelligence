'use client';

import { ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { Cite } from '@/components/evidence/Cite';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as client from '@/lib/api/client';
import { useLoadedPackage } from '@/lib/api/package';
import { LEVEL, warnLevel } from '@/lib/format';
import type { Contract, ContractDraft } from '@/lib/types';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { StageHead } from './parts';

const WARN = { high: 'bg-worse-tint text-worse', medium: 'bg-watch-tint text-watch', low: 'bg-good-tint text-good' } as const;
const EMPTY: ContractDraft = { title: '', supplier: '', value: 5, signed: '2024-07', planned: 50, actual: 40, paymentDays: 30 };

function Field({ label, children, id }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[11.5px] text-muted-ink">
        {label}
      </Label>
      {children}
    </div>
  );
}

function AddContractForm() {
  const { mutate } = useLoadedPackage();
  const setContract = useUi((s) => s.setContract);
  const [d, setD] = useState(EMPTY);
  const id = useId();
  const set = (k: keyof ContractDraft, num = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: num ? Number(e.target.value) : e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) return;
    void mutate((id, version) => client.addContract(id, version, d)).then((v) => {
      if (!v) return;
      setContract(v.contracts.at(-1)?.id ?? null);
      setD(EMPTY);
    });
  };
  const input = 'h-8 bg-surface';
  return (
    <form aria-label="Add your own contract" onSubmit={submit} className="mt-3 grid gap-3">
      <Field label="Contract title" id={`${id}-t`}>
        <Input id={`${id}-t`} value={d.title} onChange={set('title')} placeholder="For example: Bridge works, Lot 4" required className={input} />
      </Field>
      <Field label="Supplier" id={`${id}-s`}>
        <Input id={`${id}-s`} value={d.supplier} onChange={set('supplier')} className={input} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Value, US$ M" id={`${id}-v`}>
          <Input id={`${id}-v`} type="number" min={0} step={0.1} value={d.value} onChange={set('value', true)} className={input} />
        </Field>
        <Field label="Signed" id={`${id}-d`}>
          <Input id={`${id}-d`} type="month" value={d.signed} onChange={set('signed')} className={input} />
        </Field>
        <Field label="Payment days" id={`${id}-p`}>
          <Input id={`${id}-p`} type="number" min={0} value={d.paymentDays} onChange={set('paymentDays', true)} className={input} />
        </Field>
        <Field label="Planned, %" id={`${id}-pl`}>
          <Input id={`${id}-pl`} type="number" min={0} max={100} value={d.planned} onChange={set('planned', true)} className={input} />
        </Field>
        <Field label="Actual, %" id={`${id}-a`}>
          <Input id={`${id}-a`} type="number" min={0} max={100} value={d.actual} onChange={set('actual', true)} className={input} />
        </Field>
      </div>
      <Button type="submit" size="sm" className="w-fit">
        Add contract
      </Button>
    </form>
  );
}

export function ExecutionColumn({ portfolio, selected }: { portfolio: Contract[]; selected: Contract }) {
  const setContract = useUi((s) => s.setContract);
  const { mutate } = useLoadedPackage();
  const highRisk = portfolio.filter((p) => p.warning >= 0.6).length;

  return (
    <Card id="stage-execution" className="scroll-mt-28 lg:col-span-2 2xl:col-span-1">
      <CardContent>
        <StageHead n={3} title="Execution" tone={highRisk ? 'bad' : 'good'} status={highRisk ? `${highRisk} contract${highRisk > 1 ? 's' : ''} at high risk` : 'No high-risk contracts'} />
        <ul role="listbox" aria-label="Contracts" className="grid gap-1.5">
          {portfolio.map((p) => {
            const on = p.id === selected.id;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={on}
                tabIndex={0}
                onClick={() => setContract(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setContract(p.id))}
                className={cn('cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', on ? 'border-ink bg-sunk' : 'border-rule hover:bg-sunk')}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-ink">{p.id}</span>
                  <span className={cn('rounded-full px-2 text-xs font-semibold', WARN[warnLevel(p.warning)])}>{Math.round(p.warning * 100)}%</span>
                </span>
                <span className="mt-0.5 block truncate text-ink-2">{p.title}</span>
                <span className="relative mt-1.5 block h-1.5 rounded-full bg-sunk" aria-label={`${p.actual}% done against ${p.planned}% planned`} role="img">
                  <span className="block h-full rounded-full bg-ink-2" style={{ width: `${p.actual}%` }} />
                  <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-worse" style={{ left: `${p.planned}%` }} />
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-lg bg-sunk p-3" data-testid="contract-signals">
          <p className="text-sm">
            <strong className="text-ink">{selected.id}</strong>{' '}
            <span className="text-muted-ink">
              {selected.supplier}, US${selected.value}M
            </span>
          </p>
          <ul className="mt-2 grid gap-2">
            {selected.signals.map((s) => (
              <li key={s.text} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-sm">
                <span className={cn('h-fit rounded px-1.5 text-center text-xs font-semibold', WARN[s.level])}>{LEVEL[s.level]}</span>
                <span className="text-ink-2">
                  {s.text}
                  {s.own ? (
                    <Badge variant="secondary" className="ml-1.5 text-[11px]">
                      Your data
                    </Badge>
                  ) : (
                    <Cite ids={s.cite ?? []} />
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.mapped && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/map?contract=${selected.id}`}>Show on map</Link>
              </Button>
            )}
            {selected.custom && (
              <Button variant="ghost" size="sm" onClick={() => void mutate((id, version) => client.removeContract(id, version, selected.id)).then((v) => v && setContract(null))}>
                Remove this contract
              </Button>
            )}
          </div>
        </div>

        <Collapsible className="mt-3">
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-procedure hover:underline">
            Add your own contract <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <AddContractForm />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
