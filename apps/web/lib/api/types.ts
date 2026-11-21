// Types for the Node API, generated from its OpenAPI contract
// (services/api/openapi.json → schema.d.ts via `npm run types:api`).
import type { components } from './schema';

type S = components['schemas'];

export type Reference = S['Reference'];
export type Country = S['Country'];
export type Package = S['Package'];
export type Criteria = S['Criteria'];
export type Category = S['Category'];
export type LayerId = S['LayerId'];
export type Layer = S['Layer'];
export type Contract = S['Contract'];
export type ContractDraft = S['ContractDraft'];
export type Signal = S['Signal'];
export type Milestone = S['Milestone'];
export type Source = S['Source'];
export type Road = S['Road'];
export type RoadSegment = S['RoadSegment'];
export type RatingPoint = S['RatingPoint'];
export type Signoff = S['Signoff'];
export type Analysis = S['Analysis'];
export type PredictionView = S['PredictionView'];
export type Risk = S['Risk'];
export type MethodOption = S['MethodOption'];
export type Finding = S['Finding'];
export type CriteriaCheck = S['CriteriaCheck'];
export type Recommendation = S['Recommendation'];
export type Step = S['Step'];
export type PackageView = S['PackageView'];
export type PackageSummary = S['PackageSummary'];
export type AskResponse = S['AskResponse'];
export type AskTurn = S['AskTurn'];
export type AskThread = S['AskThread'];
export type KeptClaim = S['KeptClaim'];
export type LearnEvent = S['LearnEvent'];
export type LearnState = S['LearnState'];
export type Problem = S['Problem'];

/** Content documents are free-form per view; views type the parts they read. */
export type Content = Record<string, unknown>;
