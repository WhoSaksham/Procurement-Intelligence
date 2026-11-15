'use client';

import { ChevronDownIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CATEGORIES, COUNTRIES, METHODS, SECTORS } from '@/data/reference';
import { allCountries, country } from '@/lib/model';
import { useScenario } from '@/lib/store';
import type { Category, Country, Package } from '@/lib/types';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { Fact, NumberField, opts, SelectField } from './fields';

const NEW = '__new';
type Scores = Pick<Country, 'cpia' | 'rq' | 'fcv'>;
const BLANK = { name: '', region: '', cpia: 3.3, rq: 30, fcv: false };

function ScoreFields({ value, onChange }: { value: Scores; onChange: (v: Scores) => void }) {
  const fcvId = useId();
  return (
    <>
      <NumberField label="CPIA public sector mgmt (1–6)" min={1} max={6} step={0.1} value={value.cpia} onChange={(cpia) => onChange({ ...value, cpia })} />
      <NumberField label="WGI regulatory quality, percentile" min={0} max={100} value={value.rq} onChange={(rq) => onChange({ ...value, rq })} />
      <label htmlFor={fcvId} className="flex items-center gap-2 text-sm text-ink-2">
        <input id={fcvId} type="checkbox" className="size-4 accent-[var(--procedure)]" checked={value.fcv} onChange={(e) => onChange({ ...value, fcv: e.target.checked })} />
        Fragile or conflict-affected
      </label>
    </>
  );
}

function AddCountry({ onDone }: { onDone: () => void }) {
  const upsertCountry = useScenario((s) => s.upsertCountry);
  const setPkg = useScenario((s) => s.setPkg);
  const [draft, setDraft] = useState(BLANK);
  const nameId = useId();
  const regionId = useId();
  const save = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    const id = `X-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
    upsertCountry({ id, name, region: draft.region.trim() || 'Custom region', cpia: draft.cpia, rq: draft.rq, fcv: draft.fcv, cpiaImputed: false });
    setPkg({ country: id });
    onDone();
  };
  return (
    <form aria-label="Add a country" onSubmit={save} className="grid gap-3">
      <Fact label="Name" htmlFor={nameId}>
        <Input id={nameId} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus required className="h-8" />
      </Fact>
      <Fact label="Region" htmlFor={regionId}>
        <Input id={regionId} value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} className="h-8" />
      </Fact>
      <ScoreFields value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Add and use
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MoreFields() {
  const pkg = useScenario((s) => s.pkg);
  const setPkg = useScenario((s) => s.setPkg);
  const countries = useScenario((s) => s.countries);
  const upsertCountry = useScenario((s) => s.upsertCountry);
  const resetCountry = useScenario((s) => s.resetCountry);
  const sectorId = useId();
  const current = country(pkg.country, countries);
  const builtIn = COUNTRIES.some((c) => c.id === current.id);
  const overridden = countries.some((c) => c.id === current.id);
  return (
    <div className="grid gap-3">
      <Fact label="Sector" htmlFor={sectorId}>
        <Input id={sectorId} list="sector-list" value={pkg.sector} onChange={(e) => setPkg({ sector: e.target.value })} className="h-8" />
        <datalist id="sector-list">
          {SECTORS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Fact>
      <SelectField label="Bank review" value={pkg.review} options={opts(['Prior', 'Post'])} onChange={(v) => setPkg({ review: v as Package['review'] })} />
      <SelectField
        label="Implementing agency"
        value={pkg.agency}
        options={[
          { value: 'first', label: 'First Bank-financed project' },
          { value: 'some', label: 'Some prior experience' },
          { value: 'experienced', label: 'Experienced' },
        ]}
        onChange={(v) => setPkg({ agency: v as Package['agency'] })}
      />
      <SelectField label="E&S risk" value={pkg.esRisk} options={opts(['Low', 'Moderate', 'Substantial', 'High'])} onChange={(v) => setPkg({ esRisk: v as Package['esRisk'] })} />
      <NumberField label="Contract months" min={1} max={72} value={pkg.durationMonths} onChange={(durationMonths) => setPkg({ durationMonths })} />
      <p className="mt-1 border-t border-rule pt-3 font-serif text-sm font-semibold">Governance scores, {current.name}</p>
      <ScoreFields value={current} onChange={(v) => upsertCountry({ ...current, ...v, cpiaImputed: false })} />
      {overridden && (
        <button
          type="button"
          className="w-fit text-sm text-procedure hover:underline"
          onClick={() => {
            resetCountry(current.id);
            if (!builtIn) setPkg({ country: COUNTRIES[0].id });
          }}
        >
          {builtIn ? 'Restore published scores' : `Delete ${current.name}`}
        </button>
      )}
    </div>
  );
}

/** Every package field is editable in place, from any view. */
export function PackageBar() {
  const pkg = useScenario((s) => s.pkg);
  const setPkg = useScenario((s) => s.setPkg);
  const countries = useScenario((s) => s.countries);
  const setPalette = useUi((s) => s.setPalette);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);

  const setCategory = (category: Category) =>
    setPkg({ category, ...(METHODS[category].includes(pkg.method) ? {} : { method: METHODS[category][0] }) });

  return (
    <header className="z-20 border-b border-rule bg-paper/95 backdrop-blur supports-backdrop-filter:bg-paper/80 lg:sticky lg:top-0">
      <div className="grid max-w-[1280px] gap-2 px-4 py-2.5 md:px-8">
        <div className="flex items-center gap-3">
          <Input
            aria-label="Package name"
            value={pkg.name}
            onChange={(e) => setPkg({ name: e.target.value })}
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 font-serif text-base font-semibold shadow-none hover:border-rule focus-visible:bg-surface md:max-w-md"
          />
          <Button variant="outline" size="sm" className="lg:hidden" aria-expanded={open} aria-controls="package-fields" onClick={() => setOpen(!open)}>
            <SlidersHorizontalIcon /> Package details
          </Button>
          <Button variant="outline" size="sm" className="ml-auto hidden text-ink-2 lg:inline-flex" onClick={() => setPalette(true)}>
            Jump to <kbd className="rounded border border-rule px-1 text-[11px] text-muted-ink">⌘K</kbd>
          </Button>
        </div>
        <div id="package-fields" className={cn('flex-wrap items-end gap-x-4 gap-y-3 lg:flex', open ? 'flex' : 'hidden')}>
          <SelectField
            label="Country"
            value={pkg.country}
            options={allCountries(countries).map((c) => ({ value: c.id, label: c.name }))}
            extra={{ value: NEW, label: 'Add a country…' }}
            // Open the dialog after the menu has closed and returned focus.
            onChange={(v) => (v === NEW ? requestAnimationFrame(() => setAdding(true)) : setPkg({ country: v }))}
            triggerClassName="min-w-32"
          />
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogContent className="sm:max-w-sm">
              <DialogTitle className="font-serif">Add a country</DialogTitle>
              <DialogDescription>Its scores feed the forecast immediately. Kept in this browser with your scenario.</DialogDescription>
              <AddCountry onDone={() => setAdding(false)} />
            </DialogContent>
          </Dialog>
          <SelectField label="Category" value={pkg.category} options={opts(CATEGORIES)} onChange={(v) => setCategory(v as Category)} />
          <SelectField label="Method" value={pkg.method} options={opts(METHODS[pkg.category])} onChange={(method) => setPkg({ method })} />
          <NumberField label="Estimate, US$ M" min={0.1} step={0.1} value={pkg.value} onChange={(value) => setPkg({ value })} />
          <NumberField label="Lots" min={1} max={8} value={pkg.lots} onChange={(lots) => setPkg({ lots })} className="[&_input]:w-16" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="text-ink-2">
                More <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
              <MoreFields />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
