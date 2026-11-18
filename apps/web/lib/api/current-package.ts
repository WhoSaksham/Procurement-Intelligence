import { create } from 'zustand';
import type { Change } from './write-queue';

/** Browser storage key for the last package the analyst had open (a convenience only). */
export const CURRENT_KEY = 'procurement-current-package';
export const EXAMPLE_ID = 'example';

/** Which package to open: `?pkg=` first, then the remembered one, then the example. */
export function initialPackageId(search: string, storage: Pick<Storage, 'getItem'> | null): string {
  const fromUrl = new URLSearchParams(search).get('pkg');
  if (fromUrl && /^[\w-]{1,40}$/.test(fromUrl)) return fromUrl;
  try {
    const stored = storage?.getItem(CURRENT_KEY);
    if (stored && /^[\w-]{1,40}$/.test(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return EXAMPLE_ID;
}

export function rememberPackageId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* storage unavailable: keep working without it */
  }
  // Keep a deep link in the address bar pointing at what is on screen.
  const url = new URL(window.location.href);
  if (url.searchParams.has('pkg') && url.searchParams.get('pkg') !== id) {
    url.searchParams.set('pkg', id);
    window.history.replaceState(window.history.state, '', url);
  }
}


interface CurrentPackage {
  /** Null until the browser has decided which package to open (server and first render agree). */
  id: string | null;
  /** Unsaved edits per package, shown on top of the last saved state. */
  drafts: Record<string, Change>;
  setId: (id: string) => void;
  /**
   * The example's copy exists: move the unsaved edits to it and, if the example
   * is still on screen, show the copy, in one update (no frame shows one without
   * the other). If the analyst has already switched elsewhere, stay there.
   */
  adoptCopy: (exampleId: string, copyId: string) => void;
  setDraft: (id: string, draft: Change) => void;
  mergeDraft: (id: string, change: Change) => void;
}

const remember = (id: string) => {
  if (typeof window !== 'undefined') rememberPackageId(id);
};

/** The package on screen and its unsaved edits. Set from effects and event handlers. */
export const useCurrentPackage = create<CurrentPackage>()((set) => ({
  id: null,
  drafts: {},
  setId: (id) => {
    set({ id });
    remember(id);
  },
  adoptCopy: (exampleId, copyId) => {
    const stay = useCurrentPackage.getState().id !== exampleId;
    set((s) => ({ ...(stay ? {} : { id: copyId }), drafts: { ...s.drafts, [copyId]: s.drafts[exampleId] ?? {}, [exampleId]: {} } }));
    if (!stay) remember(copyId);
  },
  setDraft: (id, draft) => set((s) => ({ drafts: { ...s.drafts, [id]: draft } })),
  mergeDraft: (id, change) =>
    set((s) => {
      const cur = s.drafts[id] ?? {};
      return { drafts: { ...s.drafts, [id]: { pkg: { ...cur.pkg, ...change.pkg }, criteria: { ...cur.criteria, ...change.criteria } } } };
    }),
}));
