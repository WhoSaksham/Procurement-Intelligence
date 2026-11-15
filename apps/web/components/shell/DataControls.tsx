'use client';

import { toast } from 'sonner';
import { LAYERS } from '@/data/sources';
import { exportFileName, exportScenario, parseImport } from '@/lib/scenario';
import { useScenario } from '@/lib/store';
import type { LayerId } from '@/lib/types';

const SWATCH: Record<LayerId, string> = { ledger: 'bg-ledger', procedure: 'bg-procedure', retrospective: 'bg-retro' };

/** Save, load or reset the scenario (the hidden file input is shared with the command menu). */
export function useScenarioFile() {
  const importScenario = useScenario((s) => s.importScenario);
  const resetAll = useScenario((s) => s.resetAll);

  const download = () => {
    const s = useScenario.getState();
    const blob = new Blob([exportScenario(s)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: exportFileName(s) });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const load = async (file: File) => {
    const result = parseImport(await file.text());
    if (result.ok) {
      importScenario(result.scenario);
      toast.success(`Loaded ${file.name}`);
    } else {
      toast.error(`${file.name} is not a scenario file exported from this app`, { description: result.error });
    }
  };

  const reset = () => {
    resetAll();
    toast('Reset to the example scenario');
  };

  return { download, load, reset };
}

export function openImportDialog() {
  document.querySelector<HTMLInputElement>('[data-testid="import-file"]')?.click();
}

/** Rail footer: the analyst's own data, and what the citation colours mean. */
export function DataControls() {
  const { download, reset } = useScenarioFile();
  const btn = 'rounded px-1.5 py-0.5 text-rail-foreground hover:bg-rail-hover hover:text-rail-strong';
  return (
    <div className="grid gap-3">
      <div>
        <p className="mb-1 font-semibold text-rail-foreground">Your data</p>
        <div className="-ml-1.5 flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={openImportDialog}>
            Import
          </button>
          <button type="button" className={btn} onClick={download}>
            Export
          </button>
          <button type="button" className={btn} onClick={reset}>
            Reset
          </button>
        </div>
      </div>
      <ul aria-label="Citation colours" className="grid gap-1">
        {(Object.keys(LAYERS) as LayerId[]).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${SWATCH[k]}`} aria-hidden="true" />
            {LAYERS[k].question}
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
