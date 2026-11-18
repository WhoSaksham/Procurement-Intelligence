import { z } from 'zod';
import '../../openapi/registry.js';
import type * as T from './types.js';

// zod mirrors of the domain types. They validate requests, describe responses
// in the OpenAPI document (from which the web app's types are generated), and
// are checked against the TypeScript types at the bottom of this file.

const num = z.number().finite();
const nonNeg = num.min(0);
const positive = num.gt(0);

export const LayerId = z.enum(['ledger', 'procedure', 'retrospective']).openapi('LayerId');
export const Category = z.enum(['Civil Works', 'Goods', 'Consulting Services', 'Non-consulting Services']).openapi('Category');
export const Review = z.enum(['Prior', 'Post']);
export const Agency = z.enum(['first', 'some', 'experienced']);
export const EsRisk = z.enum(['Low', 'Moderate', 'Substantial', 'High']);

export const Country = z
  .object({
    id: z.string().min(1).max(12),
    name: z.string().min(1).max(80),
    region: z.string().min(1).max(80),
    cpia: num.min(1).max(6),
    rq: num.min(0).max(100),
    fcv: z.boolean(),
    cpiaImputed: z.boolean(),
    custom: z.boolean().optional(),
  })
  .openapi('Country');

export const Package = z
  .object({
    name: z.string().min(1).max(200),
    country: z.string().min(1).max(12),
    sector: z.string().min(1).max(80),
    category: Category,
    method: z.string().min(1).max(80),
    /** US$ millions. */
    value: positive.max(100_000),
    durationMonths: num.min(1).max(240),
    review: Review,
    agency: Agency,
    lots: z.number().int().min(1).max(50),
    esRisk: EsRisk,
    plannedDays: num.min(1).max(3650),
  })
  .openapi('Package');

export const Criteria = z
  .object({
    turnover: nonNeg,
    similarContracts: nonNeg,
    similarValuePct: nonNeg,
    bidSecurityPct: nonNeg,
    submissionDays: nonNeg,
    validityDays: nonNeg,
    jvAllowed: z.boolean(),
    specText: z.string().max(10_000),
  })
  .openapi('Criteria');

export const Signal = z
  .object({ text: z.string(), level: z.enum(['low', 'medium', 'high']), cite: z.array(z.string()).optional(), own: z.boolean().optional() })
  .openapi('Signal');

export const Milestone = z
  .object({
    name: z.string(),
    planned: z.tuple([z.string(), z.string()]),
    actual: z.tuple([z.string().nullable(), z.string().nullable()]),
  })
  .openapi('Milestone');

export const Contract = z
  .object({
    id: z.string().min(1).max(40),
    title: z.string(),
    supplier: z.string(),
    value: num,
    signed: z.string(),
    planned: num,
    actual: num,
    warning: num,
    mapped: z.boolean().optional(),
    custom: z.boolean().optional(),
    signals: z.array(Signal),
    milestones: z.array(Milestone),
  })
  .openapi('Contract');

export const ContractDraft = z
  .object({
    title: z.string().trim().min(1).max(200),
    supplier: z.string().max(200),
    value: positive,
    signed: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM').optional(),
    paymentDays: nonNeg.max(1000),
    planned: nonNeg.max(100),
    actual: nonNeg.max(100),
  })
  .openapi('ContractDraft');

export const Source = z
  .object({
    id: z.string(),
    layer: LayerId,
    kind: z.string(),
    title: z.string(),
    project: z.string(),
    date: z.string(),
    locator: z.string(),
    before: z.string().optional(),
    quote: z.string(),
    after: z.string().optional(),
  })
  .openapi('Source');

const Driver = z.object({ label: z.string(), pp: num });
const Risk = z.object({ p: num, drivers: z.array(Driver) }).openapi('Risk');
const TimelineDriver = z.object({ label: z.string(), pct: num });

export const PredictionView = z
  .object({
    scale: num,
    shape: num,
    p20: num,
    p50: num,
    p80: num,
    timelineDrivers: z.array(TimelineDriver),
    rebid: Risk,
    amend: Risk,
    slip: Risk,
  })
  .openapi('PredictionView');

export const MethodOption = z
  .object({ method: z.string(), p20: num, p50: num, p80: num, rebid: num, current: z.boolean(), limit: z.string().nullable() })
  .openapi('MethodOption');

export const Finding = z
  .object({
    id: z.string(),
    label: z.string(),
    value: z.string(),
    benchmark: z.string(),
    status: z.enum(['ok', 'watch', 'flag']),
    advice: z.string(),
    cite: z.array(z.string()),
    weight: num,
  })
  .openapi('Finding');

export const CriteriaCheck = z.object({ findings: z.array(Finding), stringency: num, annualCash: num }).openapi('CriteriaCheck');
export const Comparables = z.object({ n: num, widened: z.boolean(), close: num.optional() }).openapi('Comparables');
export const Recommendation = z.object({ title: z.string(), body: z.string(), cite: z.array(z.string()), stage: z.string() }).openapi('Recommendation');
export const Step = z.object({ name: z.string(), tool: z.string(), detail: z.string() }).openapi('Step');

export const Analysis = z
  .object({
    country: Country,
    check: CriteriaCheck,
    prediction: PredictionView.extend({ onTime: num }),
    atBenchmark: PredictionView,
    curve: z.array(z.object({ t: num, model: num, history: num })),
    methods: z.array(MethodOption),
    best: z.string().nullable(),
    comparables: Comparables,
    sample: z.array(num),
    benchmarkDays: num,
    recommendations: z.array(Recommendation),
    trace: z.array(Step),
    stale: z.boolean(),
  })
  .openapi('Analysis');

export const RoadSegment = z
  .object({
    from: num,
    to: num,
    status: z.enum(['sealed', 'base', 'earthworks', 'not-started']),
    change: num,
    note: z.string().nullable(),
    coords: z.array(z.tuple([num, num])),
  })
  .openapi('RoadSegment');
export const Road = z
  .object({ ends: z.tuple([z.string(), z.string()]).optional(), cite: z.array(z.string()).optional(), lengthKm: num, segments: z.array(RoadSegment) })
  .openapi('Road');

export const RatingPoint = z
  .object({ label: z.string(), date: z.string(), rating: z.string(), cite: z.string().optional(), retrospective: z.boolean().optional() })
  .openapi('RatingPoint');
export const Layer = z.object({ name: z.string(), question: z.string(), note: z.string() }).openapi('Layer');

export const Reference = z
  .object({
    countries: z.array(Country),
    sectors: z.array(z.string()),
    categories: z.array(Category),
    methods: z.record(Category, z.array(z.string())),
    defaultPackage: Package,
    defaultCriteria: Criteria,
    layers: z.record(LayerId, Layer),
    ratingScale: z.array(z.string()),
    ratingNames: z.record(z.string(), z.string()),
    isrHistory: z.array(RatingPoint),
  })
  .openapi('Reference');

export const Signoff = z.object({ name: z.string(), at: z.string(), brief: z.string() }).openapi('Signoff');

export const Claim = z.object({ text: z.string(), cite: z.array(z.string()), support: num }).openapi('Claim');
export const Answer = z.object({ q: z.string(), keys: z.array(z.string()), claims: z.array(Claim) }).openapi('Answer');

export const LearnEvent = z
  .object({
    when: z.string().optional(),
    layer: LayerId,
    title: z.string(),
    updates: z.array(z.tuple([z.string(), z.string()])),
    fresh: z.boolean(),
  })
  .openapi('LearnEvent');

// ── Compile-time agreement between the zod schemas and the domain types ──
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const agree = <_ extends true>() => undefined;
agree<Same<z.infer<typeof Country>, T.Country>>();
agree<Same<z.infer<typeof Package>, T.Package>>();
agree<Same<z.infer<typeof Criteria>, T.Criteria>>();
agree<Same<z.infer<typeof Contract>, T.Contract>>();
agree<Same<z.infer<typeof Source>, T.Source & { id: string }>>();
agree<Same<z.infer<typeof MethodOption>, T.MethodOption>>();
agree<Same<z.infer<typeof CriteriaCheck>, T.CriteriaCheck>>();
agree<Same<z.infer<typeof Comparables>, T.Comparables>>();
agree<Same<z.infer<typeof Recommendation>, T.Recommendation>>();
agree<Same<z.infer<typeof Road>, T.Road>>();
agree<Same<z.infer<typeof Answer>, T.Answer>>();
agree<Same<z.infer<typeof Signoff>, T.Signoff>>();
