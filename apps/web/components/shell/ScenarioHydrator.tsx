'use client';

import { useEffect } from 'react';
import { useScenario } from '@/lib/store';

/**
 * Loads the saved scenario from browser storage after the first render, so
 * the server HTML and the first browser render agree (no hydration mismatch).
 */
export function ScenarioHydrator() {
  useEffect(() => {
    void useScenario.persist.rehydrate();
  }, []);
  return null;
}
