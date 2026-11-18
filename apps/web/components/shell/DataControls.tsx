'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as client from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import { useCurrentPackage } from '@/lib/api/current-package';
import { usePackage } from '@/lib/api/package';
import { qk, useReference } from '@/lib/api/queries';
import type { LayerId } from '@/lib/types';

const SWATCH: Record<LayerId, string> = { ledger: 'bg-ledger', procedure: 'bg-procedure', retrospective: 'bg-retro' };

/** Export, import or reset the current package (the hidden file input is shared with the command menu). */
export function useScenarioFile() {
  const { view, setId, flush, mutate } = usePackage();
  const qc = useQueryClient();

  const download = async () => {
    await flush();
    // Read the package after saving: the first edit on the example may just have switched to its copy.
    const current = useCurrentPackage.getState().id;
    if (!current) return;
    const a = Object.assign(document.createElement('a'), { href: client.exportPackageUrl(current), download: '' });
    a.click();
  };

  const load = async (file: File) => {
    try {
      const v = await client.importPackage(await file.text());
      qc.setQueryData(qk.pkg(v.id), v);
      void qc.invalidateQueries({ queryKey: qk.packages });
      setId(v.id);
      toast.success(`Loaded ${file.name} as “${v.pkg.name}”`);
    } catch (e) {
      toast.error(`${file.name} is not a scenario file exported from this app`, { description: e instanceof ApiError ? e.message : undefined });
    }
  };

  const reset = async () => {
    if (!view || view.example) {
      toast('This is the example; it is always as published');
      return;
    }
    if (await mutate(client.resetPackage)) toast('Reset to the example');
  };

  return { download, load, reset, canReset: !!view && !view.example };
}

export function openImportDialog() {
  document.querySelector<HTMLInputElement>('[data-testid="import-file"]')?.click();
}

/** Rail footer: the analyst's own data, and what the citation colours mean. */
export function DataControls() {
  const { download, reset, canReset } = useScenarioFile();
  const layers = useReference().data?.layers;
  const btn = 'rounded px-1.5 py-0.5 text-rail-foreground hover:bg-rail-hover hover:text-rail-strong';
  return (
    <div className="grid gap-3">
      <div>
        <p className="mb-1 font-semibold text-rail-foreground">Your data</p>
        <div className="-ml-1.5 flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={openImportDialog}>
            Import
          </button>
          <button type="button" className={btn} onClick={() => void download()}>
            Export
          </button>
          {canReset && (
            <button type="button" className={btn} onClick={() => void reset()}>
              Reset
            </button>
          )}
        </div>
      </div>
      <ul aria-label="Citation colours" className="grid gap-1">
        {layers &&
          (Object.keys(layers) as LayerId[]).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-sm ${SWATCH[k]}`} aria-hidden="true" />
              {layers[k]?.question}
            </li>
          ))}
      </ul>
    </div>
  );
}

/** The one file input behind every "Import" control. Mounted once in the layout. */
export function ImportInput() {
  const { load } = useScenarioFile();
  return (
    <input
      data-testid="import-file"
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void load(f);
        e.target.value = '';
      }}
    />
  );
}
