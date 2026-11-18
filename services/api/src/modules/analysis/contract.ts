import type { Contract, ContractDraft, Criteria, Package, Signal, Signoff } from './types.js';

// Moved unchanged from the web app's lib/scenario.ts.

/** Warning score and signals for a contract entered by the analyst. */
export function buildContract(d: ContractDraft, n: number): Contract {
  const gap = Math.max(0, d.planned - d.actual);
  const late = Math.max(0, d.paymentDays - 28);
  const warning = 1 / (1 + Math.exp(-(-2.2 + gap / 7 + late / 25)));
  const signals: Signal[] = [
    gap > 0
      ? { text: `Progress ${gap} points behind plan`, level: gap >= 15 ? 'high' : gap >= 5 ? 'medium' : 'low', own: true }
      : { text: 'Progress on or ahead of plan', level: 'low', own: true },
  ];
  if (late) {
    signals.push({
      text: `Payment certificates clearing in ${d.paymentDays} days against 28 contractual`,
      level: d.paymentDays > 56 ? 'high' : 'medium',
      own: true,
    });
  }
  return {
    id: `USR-${String(n).padStart(2, '0')}`,
    title: d.title.trim(),
    supplier: d.supplier.trim() || 'Supplier not given',
    value: d.value,
    signed: `${d.signed ?? '2024-07'}-01`,
    planned: d.planned,
    actual: d.actual,
    warning: Math.round(warning * 100) / 100,
    custom: true,
    signals,
    milestones: [],
  };
}

export const signoffBrief = (pkg: Package, criteria: Criteria) => JSON.stringify({ pkg, criteria });

/** True when the package or criteria changed after sign-off. */
export const isStale = (signoff: Signoff | null, pkg: Package, criteria: Criteria) =>
  !!signoff && signoff.brief !== signoffBrief(pkg, criteria);
