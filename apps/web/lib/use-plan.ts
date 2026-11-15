'use client';

import { useMemo } from 'react';
import { PORTFOLIO } from '@/data/reference';
import { bestMethod, checkCriteria, predict } from '@/lib/model';
import { useScenario } from '@/lib/store';

/** The scenario plus everything derived from it, recomputed only when inputs change. */
export function usePlan() {
  const pkg = useScenario((s) => s.pkg);
  const criteria = useScenario((s) => s.criteria);
  const countries = useScenario((s) => s.countries);
  const contracts = useScenario((s) => s.contracts);
  const check = useMemo(() => checkCriteria(pkg, criteria), [pkg, criteria]);
  const result = useMemo(() => predict(pkg, countries, check.stringency), [pkg, countries, check.stringency]);
  const best = useMemo(() => bestMethod(pkg, countries, check.stringency), [pkg, countries, check.stringency]);
  const portfolio = useMemo(() => [...PORTFOLIO, ...contracts].sort((a, b) => b.warning - a.warning), [contracts]);
  return { pkg, criteria, countries, contracts, check, result, best, portfolio };
}
