'use client';

import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { benchmarkCriteria } from '@/lib/model';
import {
  buildContract,
  DEFAULT_SCENARIO,
  hydrate,
  signoffBrief,
  STORAGE_KEY,
  type Scenario,
} from '@/lib/scenario';
import type { Contract, ContractDraft, Country, Criteria, Package } from '@/lib/types';

interface Actions {
  setPkg: (patch: Partial<Package>) => void;
  setCriteria: (patch: Partial<Criteria>) => void;
  applyBenchmark: () => void;
  upsertCountry: (c: Country) => void;
  resetCountry: (id: string) => void;
  addContract: (draft: ContractDraft) => Contract;
  removeContract: (id: string) => void;
  signOff: (name: string) => void;
  importScenario: (s: Scenario) => void;
  resetAll: () => void;
}

export type ScenarioStore = Scenario & Actions;

const pick = (s: Scenario): Scenario => ({
  pkg: s.pkg,
  criteria: s.criteria,
  countries: s.countries,
  contracts: s.contracts,
  signoff: s.signoff,
});

// Read and write the bare scenario JSON (not zustand's {state, version}
// envelope), so saves from the original app and exported files stay readable.
const storage: PersistStorage<Scenario> = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name);
      return raw ? ({ state: hydrate(JSON.parse(raw)), version: 1 } satisfies StorageValue<Scenario>) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(pick(value.state)));
    } catch {
      /* storage unavailable (private mode, quota): keep working in memory */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const nextContractNumber = (contracts: Contract[]) =>
  contracts.reduce((n, c) => Math.max(n, Number(/^USR-(\d+)$/.exec(c.id)?.[1] ?? 0)), 0) + 1;

export const useScenario = create<ScenarioStore>()(
  persist<ScenarioStore, [], [], Scenario>(
    (set, get) => ({
      ...DEFAULT_SCENARIO,
      setPkg: (patch) => set((s) => ({ pkg: { ...s.pkg, ...patch } })),
      setCriteria: (patch) => set((s) => ({ criteria: { ...s.criteria, ...patch } })),
      applyBenchmark: () => set((s) => ({ criteria: benchmarkCriteria(s.pkg, s.criteria) })),
      upsertCountry: (c) => set((s) => ({ countries: [...s.countries.filter((x) => x.id !== c.id), { ...c, custom: true }] })),
      resetCountry: (id) => set((s) => ({ countries: s.countries.filter((x) => x.id !== id) })),
      addContract: (draft) => {
        const contract = buildContract(draft, nextContractNumber(get().contracts));
        set((s) => ({ contracts: [...s.contracts, contract] }));
        return contract;
      },
      removeContract: (id) => set((s) => ({ contracts: s.contracts.filter((c) => c.id !== id) })),
      signOff: (name) =>
        set((s) => ({ signoff: { name: name.trim(), at: new Date().toISOString(), brief: signoffBrief(s.pkg, s.criteria) } })),
      importScenario: (scenario) => set(pick(scenario)),
      resetAll: () => set(DEFAULT_SCENARIO),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage,
      partialize: pick,
      // Rehydrated from a client effect (see ScenarioHydrator) so the first
      // browser render matches the server render.
      skipHydration: true,
    },
  ),
);
