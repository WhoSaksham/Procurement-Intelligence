'use client';

import { create } from 'zustand';

/** Transient interface state shared across the shell (not persisted). */
interface UiState {
  palette: boolean;
  setPalette: (open: boolean) => void;
  /** Source id whose passage is open in the evidence sheet. */
  evidence: string | null;
  openEvidence: (id: string | null) => void;
  /** Contract selected in the Execution column (null: the highest-risk one). */
  contract: string | null;
  setContract: (id: string | null) => void;
}

export const useUi = create<UiState>()((set) => ({
  palette: false,
  setPalette: (palette) => set({ palette }),
  evidence: null,
  openEvidence: (evidence) => set({ evidence }),
  contract: null,
  setContract: (contract) => set({ contract }),
}));
