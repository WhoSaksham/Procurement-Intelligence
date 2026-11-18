import { z } from 'zod';
import { Analysis, Contract, ContractDraft, Country, Criteria, Package, Signoff } from '../analysis/schemas.js';

export const Version = z.number().int().min(1);
export const PackageId = z.string().regex(/^[\w-]{1,40}$/, 'Not a package id');

export const IdParams = z.object({ id: PackageId });
export const CountryParams = z.object({ id: PackageId, countryId: z.string().min(1).max(12) });
export const ContractParams = z.object({ id: PackageId, contractId: z.string().min(1).max(40) });
export const VersionQuery = z.object({ version: z.coerce.number().int().min(1) });

export const CreateBody = z
  .object({ fromId: PackageId.optional(), name: z.string().trim().min(1).max(200).optional() })
  .strict()
  .openapi('CreatePackageRequest');

export const PatchBody = z
  .object({
    version: Version,
    pkg: Package.partial().strict().optional(),
    criteria: Criteria.partial().strict().optional(),
  })
  .strict()
  .openapi('PatchPackageRequest');

export const VersionBody = z.object({ version: Version }).strict().openapi('VersionRequest');
export const SignoffBody = z.object({ version: Version, name: z.string().trim().min(1).max(80) }).strict().openapi('SignOffRequest');
export const CountryBody = z.object({ version: Version, country: Country.omit({ custom: true }) }).strict().openapi('UpsertCountryRequest');
export const ContractBody = z.object({ version: Version, draft: ContractDraft }).strict().openapi('AddContractRequest');

export const PackageView = z
  .object({
    id: z.string(),
    example: z.boolean(),
    version: z.number(),
    pkg: Package,
    criteria: Criteria,
    countries: z.array(Country),
    contracts: z.array(Contract),
    signoff: Signoff.nullable(),
    updatedAt: z.string(),
    analysis: Analysis,
  })
  .openapi('PackageView');

export const PackageSummary = z
  .object({ id: z.string(), name: z.string(), country: z.string(), example: z.boolean(), signedOff: z.boolean(), updatedAt: z.string() })
  .openapi('PackageSummary');
