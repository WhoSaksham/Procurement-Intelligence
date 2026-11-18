'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import * as client from '@/lib/api/client';
import { EXAMPLE_ID, useCurrentPackage } from '@/lib/api/current-package';
import { usePackage } from '@/lib/api/package';
import { qk, usePackages } from '@/lib/api/queries';
import type { PackageView } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/** Pick, create, duplicate or delete saved packages. The example is always listed and can't be deleted. */
export function PackageSwitcher() {
  const { id, setId, view, flush } = usePackage();
  const { data } = usePackages();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const opened = (v: PackageView) => {
    qc.setQueryData(qk.pkg(v.id), v);
    void qc.invalidateQueries({ queryKey: qk.packages });
    setId(v.id);
    setOpen(false);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await flush();
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="shrink-0 gap-1 px-2 text-ink-2" title="Switch package">
            {view?.example ? <Badge variant="outline">Example</Badge> : <span>Saved</span>}
            <span className="sr-only"> · switch package</span>
            <ChevronsUpDownIcon aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
          <ul aria-label="Saved packages" className="max-h-72 overflow-y-auto">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === id ? 'true' : undefined}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none', p.id === id && 'font-semibold')}
                  onClick={() => {
                    void flush();
                    setId(p.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon aria-hidden className={cn('size-4 shrink-0', p.id === id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.example && <Badge variant="outline">Example</Badge>}
                  {p.signedOff && <Badge variant="secondary">Signed off</Badge>}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid gap-0.5 border-t border-rule pt-1">
            <Button variant="ghost" size="sm" className="justify-start" disabled={busy} onClick={() => run(async () => opened(await client.createPackage()))}>
              <PlusIcon aria-hidden /> New package
            </Button>
            <Button variant="ghost" size="sm" className="justify-start" disabled={busy || !id} onClick={() => run(async () => opened(await client.createPackage({ fromId: useCurrentPackage.getState().id ?? id! })))}>
              <CopyIcon aria-hidden /> Duplicate this package
            </Button>
            {view && !view.example && (
              <Button variant="ghost" size="sm" className="justify-start text-worse" disabled={busy} onClick={() => setConfirm(true)}>
                <Trash2Icon aria-hidden /> Delete this package
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="font-serif">Delete “{view?.pkg.name}”?</DialogTitle>
          <DialogDescription>This removes the package for everyone. Export it first if you want a copy.</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!id) return;
                  await client.deletePackage(id);
                  qc.removeQueries({ queryKey: qk.pkg(id) });
                  void qc.invalidateQueries({ queryKey: qk.packages });
                  setId(EXAMPLE_ID);
                  setConfirm(false);
                  setOpen(false);
                  toast('Package deleted');
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
