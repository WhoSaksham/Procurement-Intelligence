import type {
  AskResponse,
  AskThread,
  Content,
  Country,
  ContractDraft,
  Criteria,
  LearnState,
  Package,
  PackageSummary,
  PackageView,
  Problem,
  Reference,
  Road,
  Source,
  Contract,
} from './types';

/** A non-2xx answer from the API, with its problem document. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: Partial<Problem> & { type?: string; current?: PackageView },
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
  }

  /** The problem type's last path segment, e.g. `version-conflict`. */
  get slug(): string {
    return (this.problem.type ?? '').split('/').pop() ?? '';
  }
}

/** True when the API could not be reached at all (as opposed to answering with an error). */
export const isUnreachable = (e: unknown) => (e instanceof ApiError && e.status === 503 && e.slug === 'unreachable') || e instanceof TypeError;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { cache: 'no-store', ...init });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (body ?? { detail: `Request failed (${res.status})` }) as ApiError['problem']);
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const enc = encodeURIComponent;

export const getReference = () => api<Reference>('v1/reference');
export type SourceIndexItem = Pick<Source, 'id' | 'layer' | 'kind' | 'title'>;
export const getSourceIndex = () => api<{ items: SourceIndexItem[] }>('v1/sources');
export const getSource = (id: string) => api<Source>(`v1/sources/${enc(id)}`);
export const getRoad = (contractId: string) => api<Road>(`v1/contracts/${enc(contractId)}/road`);
export const getContent = <T = Content>(view: 'package' | 'pipeline' | 'learn') => api<T>(`v1/content/${view}`);

export const getQuestions = () => api<{ questions: string[]; supportMin: number }>('v1/ask/questions');
export const ask = (q: string, o: { threadId?: string; packageId?: string } = {}) => api<AskResponse>('v1/ask', send('POST', { q, ...o }));
export const getThread = (id: string) => api<AskThread>(`v1/ask/threads/${enc(id)}`);

export const getLearnEvents = () => api<LearnState>('v1/learn/events');
export const nextLearnEvent = () => api<LearnState>('v1/learn/events/next', send('POST'));
export const resetLearnEvents = () => api<LearnState>('v1/learn/events/reset', send('POST'));

export const listPackages = () => api<{ items: PackageSummary[] }>('v1/packages');
export const createPackage = (body: { fromId?: string; name?: string } = {}) => api<PackageView>('v1/packages', send('POST', body));
export const getPackage = (id: string) => api<PackageView>(`v1/packages/${enc(id)}`);
export const patchPackage = (id: string, body: { version: number; pkg?: Partial<Package>; criteria?: Partial<Criteria> }) =>
  api<PackageView>(`v1/packages/${enc(id)}`, send('PATCH', body));
export const deletePackage = (id: string) => api<void>(`v1/packages/${enc(id)}`, send('DELETE'));
export const resetPackage = (id: string, version: number) => api<PackageView>(`v1/packages/${enc(id)}/reset`, send('POST', { version }));
export const applyBenchmark = (id: string, version: number) => api<PackageView>(`v1/packages/${enc(id)}/benchmark`, send('POST', { version }));
export const signOff = (id: string, version: number, name: string) => api<PackageView>(`v1/packages/${enc(id)}/signoff`, send('POST', { version, name }));
export const upsertCountry = (id: string, version: number, country: Omit<Country, 'custom'>) =>
  api<PackageView>(`v1/packages/${enc(id)}/countries/${enc(country.id)}`, send('PUT', { version, country }));
export const removeCountry = (id: string, version: number, countryId: string) =>
  api<PackageView>(`v1/packages/${enc(id)}/countries/${enc(countryId)}?version=${version}`, send('DELETE'));
export const addContract = (id: string, version: number, draft: ContractDraft) =>
  api<PackageView>(`v1/packages/${enc(id)}/contracts`, send('POST', { version, draft }));
export const removeContract = (id: string, version: number, contractId: string) =>
  api<PackageView>(`v1/packages/${enc(id)}/contracts/${enc(contractId)}?version=${version}`, send('DELETE'));
export const exportPackageUrl = (id: string) => `/api/v1/packages/${enc(id)}/export`;
export const importPackage = (fileText: string) =>
  api<PackageView>('v1/packages/import', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: fileText });
export const getPortfolio = (id: string) => api<{ items: Contract[] }>(`v1/packages/${enc(id)}/portfolio`);
