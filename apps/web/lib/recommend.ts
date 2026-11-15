import { country } from '@/lib/model';
import type { Country, Package, Prediction, Recommendation } from '@/lib/types';

// Prescriptive layer: each rule fires on model drivers or package facts and
// must carry at least one citation, or it is not shown.
export function recommendations(pkg: Package, result: Prediction, custom: Country[] = []): Recommendation[] {
  const c = country(pkg.country, custom);
  const recs: Recommendation[] = [];

  if (pkg.plannedDays < result.p50) {
    recs.push({
      title: `Plan for ${Math.round(result.p80)} days, not ${pkg.plannedDays}`,
      body: `Only ${Math.round(result.cdf(pkg.plannedDays) * 100)}% of comparable packages were signed within ${pkg.plannedDays} days. Using the P80 estimate in the procurement plan leaves room for one clarification round and the prior-review steps.`,
      cite: ['ca1', 'step1'],
      stage: 'Planning',
    });
  }

  if (pkg.category === 'Civil Works' && pkg.value >= 8 && pkg.lots < 3) {
    recs.push({
      title: 'Split the works into 3–4 regional lots',
      body: 'Lot-split rural roads packages drew nearly twice as many responsive bids. Allow bidders to offer cross-lot discounts and size qualification criteria per lot.',
      cite: ['ca3', 'icr1'],
      stage: 'Market approach',
    });
  }

  if (pkg.agency !== 'experienced') {
    recs.push({
      title: 'Hold a pre-bid conference and early procurement training',
      body: 'Agencies new to Bank-financed procurement were about twice as likely to re-tender works. A pre-bid conference and a short clinic on evaluation were the cheapest effective fixes.',
      cite: pkg.agency === 'first' ? ['ieg1', 'pad1'] : ['ieg1', 'proj1'],
      stage: 'Capacity',
    });
  }

  if (c.fcv || c.cpia < 3.3) {
    recs.push({
      title: 'Request hands-on expanded implementation support',
      body: `${c.name}'s governance covariates add time and risk in the model. Hands-on support during evaluation was the agreed mitigation on a comparable operation.`,
      cite: ['wgi1', 'pad1'],
      stage: 'Capacity',
    });
  }

  if (pkg.category === 'Civil Works') {
    recs.push({
      title: 'Ring-fence counterpart funds for payment certificates',
      body: 'On the closest precedent, late payment of certificates, not contractor performance, drove 14 months of slippage. Agree a payment-processing target in the project operations manual.',
      cite: ['icr2', 'isr2', 'fin1'],
      stage: 'Contract management',
    });
    recs.push({
      title: 'Complete drainage surveys before bidding',
      body: 'Packages bid without hydrological surveys averaged variation orders of about 17% of contract value.',
      cite: ['icr3', 'ca2'],
      stage: 'Tender design',
    });
  }

  if (pkg.esRisk === 'Substantial' || pkg.esRisk === 'High') {
    recs.push({
      title: 'Include ESHS requirements and an ESHS performance security',
      body: 'Required for contracts with Substantial or High E&S risk. Ask bidders for a management strategies and implementation plan with the bid.',
      cite: ['esf1'],
      stage: 'Tender design',
    });
  }

  if (pkg.method === 'RFB, open international' && pkg.value < 5 && pkg.category !== 'Consulting Services') {
    recs.push({
      title: 'Consider open national competition',
      body: 'Below this value, international advertising rarely attracts foreign bids and adds time. The national e-procurement system is accepted for Bank-financed national procurement.',
      cite: ['cpf1', 'ca1'],
      stage: 'Market approach',
    });
  }

  if (pkg.review === 'Prior') {
    recs.push({
      title: 'Budget 26 days for Bank no-objections',
      body: 'Prior-review works packages pass three review points. Submit the bidding document for review while the advertisement is being prepared.',
      cite: ['step1'],
      stage: 'Planning',
    });
  }

  return recs;
}
