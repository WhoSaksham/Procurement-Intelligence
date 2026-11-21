import type { PackageView } from '../packages/service.js';
import type { Passage } from './retrieve.js';

/**
 * The open package and its live analysis as one citable passage (id `pkg`).
 * User-typed fields appear only as quoted values here, never in a prompt's instructions.
 */
export function packagePassage(v: PackageView): Passage {
  const { pkg, analysis: a } = v;
  const p = a.prediction;
  const cohort = a.comparables.widened
    ? `Only ${a.comparables.close} close comparables, so the cohort is widened to ${a.comparables.n} ${pkg.category.toLowerCase()} packages in ${a.country.region}.`
    : `Based on ${a.comparables.n} comparable packages.`;
  const recs = a.recommendations.slice(0, 4).map((r) => r.title);
  const text = [
    `Name: ${JSON.stringify(pkg.name)}.`,
    `Country: ${a.country.name} (${a.country.region}). Sector: ${pkg.sector}. Category: ${pkg.category}. Method: ${pkg.method}.`,
    `Estimated value: US$${pkg.value}M. Lots: ${pkg.lots}. Contract duration: ${pkg.durationMonths} months. Review: ${pkg.review}. E&S risk: ${pkg.esRisk}.`,
    `Planned days from advertisement to contract signature: ${pkg.plannedDays}.`,
    `Forecast days to signature: P50 ${Math.round(p.p50)}, P80 ${Math.round(p.p80)}. Chance of signing within the planned days: ${Math.round(p.onTime * 100)}%.`,
    `Simple benchmark for this method and category: ${Math.round(a.benchmarkDays)} days. ${cohort}`,
    `Risk of re-tender: ${Math.round(p.rebid.p * 100)}%. Risk of amendment: ${Math.round(p.amend.p * 100)}%. Risk of slippage: ${Math.round(p.slip.p * 100)}%.`,
    recs.length ? `Recommended next actions: ${recs.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { id: 'pkg', title: `Your package: ${pkg.name}`, text };
}
