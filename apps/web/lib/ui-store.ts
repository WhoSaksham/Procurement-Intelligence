'use client';

import { create } from 'zustand';
import { PORTFOLIO } from '@/data/reference';

/** Transient interface state shared across the shell (not persisted). */
interface UiState {
  palette: boolean;
  setPalette: (open: boolean) => void;
  /** Source id whose passage is open in the evidence sheet. */
  evidence: string | null;
  openEvidence: (id: string | null) => void;
  /** Contract selected in the Execution column and on the map. */
  contract: string;
  setContract: (id: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  palette: false,
  setPalette: (palette) => set({ palette }),
  evidence: null,
  openEvidence: (evidence) => set({ evidence }),
  contract: PORTFOLIO[0].id,
  setContract: (contract) => set({ contract }),
}));
