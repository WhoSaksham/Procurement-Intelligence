import express, { Router } from 'express';
import { z } from 'zod';
import { body, params, query } from '../../http/validate.js';
import { route } from '../../openapi/route.js';
import { Contract } from '../analysis/schemas.js';
import {
  ContractBody,
  ContractParams,
  CountryBody,
  CountryParams,
  CreateBody,
  IdParams,
  PackageSummary,
  PackageView,
  PatchBody,
  SignoffBody,
  VersionBody,
  VersionQuery,
} from './schema.js';
import * as svc from './service.js';

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const view = (description: string, status = 200) => ({ [status]: { description, schema: PackageView } });
const tags = ['packages'];
const WRITE = [409];

export function packagesRouter(): Router {
  const r = Router();

  route(r, { method: 'get', path: '/v1/packages', summary: 'Saved packages, the example first, then most recently updated', tags, responses: { 200: { description: 'Packages', schema: z.object({ items: z.array(PackageSummary) }) } } }, async (_q, res) => {
    res.json(await svc.listPackages());
  });

  route(r, { method: 'post', path: '/v1/packages', summary: 'Create a package from the defaults, or as a copy of `fromId`', tags, request: { body: json(CreateBody) }, responses: view('Created', 201) }, async (req, res) => {
    res.status(201).json(await svc.createPackage(body(req, CreateBody)));
  });

  // Import takes the file as text (or already-parsed JSON), so a broken file can be reported as such.
  r.post('/v1/packages/import', express.text({ type: 'text/plain', limit: '1mb' }));
  route(
    r,
    {
      method: 'post',
      path: '/v1/packages/import',
      summary: 'Create a package from an exported scenario file (old exports and browser saves load)',
      tags,
      request: { body: { content: { 'text/plain': { schema: z.string() }, 'application/json': { schema: z.record(z.string(), z.unknown()) } } } },
      responses: view('Created', 201),
    },
    async (req, res) => {
      res.status(201).json(await svc.importPackage(req.body));
    },
  );

  route(r, { method: 'get', path: '/v1/packages/:id', summary: 'A package and its analysis', tags, request: { params: IdParams }, responses: view('Package') }, async (req, res) => {
    res.json(await svc.getPackage(params(req, IdParams).id));
  });

  route(
    r,
    { method: 'patch', path: '/v1/packages/:id', summary: 'Change package fields and/or criteria (optimistic concurrency on `version`)', tags, request: { params: IdParams, body: json(PatchBody) }, responses: view('Saved'), problems: WRITE },
    async (req, res) => {
      res.json(await svc.patchPackage(params(req, IdParams).id, body(req, PatchBody)));
    },
  );

  route(r, { method: 'delete', path: '/v1/packages/:id', summary: 'Delete a user package', tags, request: { params: IdParams }, responses: { 204: { description: 'Deleted' } }, problems: WRITE }, async (req, res) => {
    await svc.deletePackage(params(req, IdParams).id);
    res.status(204).end();
  });

  const versioned = (path: string, summary: string, fn: (id: string, version: number) => Promise<unknown>) =>
    route(r, { method: 'post', path, summary, tags, request: { params: IdParams, body: json(VersionBody) }, responses: view('Saved'), problems: WRITE }, async (req, res) => {
      res.json(await fn(params(req, IdParams).id, body(req, VersionBody).version));
    });
  versioned('/v1/packages/:id/reset', "Restore a user package to the example's content", svc.resetPackage);
  versioned('/v1/packages/:id/benchmark', 'Move criteria to the benchmark values', svc.applyBenchmark);

  route(r, { method: 'post', path: '/v1/packages/:id/signoff', summary: 'Sign off the brief by name', tags, request: { params: IdParams, body: json(SignoffBody) }, responses: view('Signed off'), problems: WRITE }, async (req, res) => {
    const b = body(req, SignoffBody);
    res.json(await svc.signOff(params(req, IdParams).id, b.version, b.name));
  });

  route(
    r,
    { method: 'put', path: '/v1/packages/:id/countries/:countryId', summary: 'Add or override a country for this package', tags, request: { params: CountryParams, body: json(CountryBody) }, responses: view('Saved'), problems: WRITE },
    async (req, res) => {
      const p = params(req, CountryParams);
      const b = body(req, CountryBody);
      res.json(await svc.upsertCountry(p.id, p.countryId, b.version, b.country));
    },
  );
  route(
    r,
    { method: 'delete', path: '/v1/packages/:id/countries/:countryId', summary: "Remove this package's country override", tags, request: { params: CountryParams, query: VersionQuery }, responses: view('Saved'), problems: WRITE },
    async (req, res) => {
      const p = params(req, CountryParams);
      res.json(await svc.removeCountry(p.id, p.countryId, query(req, VersionQuery).version));
    },
  );

  route(
    r,
    { method: 'post', path: '/v1/packages/:id/contracts', summary: 'Add your own contract; the server scores its warning and signals', tags, request: { params: IdParams, body: json(ContractBody) }, responses: view('Added', 201), problems: WRITE },
    async (req, res) => {
      const b = body(req, ContractBody);
      res.status(201).json(await svc.addContract(params(req, IdParams).id, b.version, b.draft));
    },
  );
  route(
    r,
    { method: 'delete', path: '/v1/packages/:id/contracts/:contractId', summary: 'Remove one of your own contracts', tags, request: { params: ContractParams, query: VersionQuery }, responses: view('Removed'), problems: WRITE },
    async (req, res) => {
      const p = params(req, ContractParams);
      res.json(await svc.removeContract(p.id, p.contractId, query(req, VersionQuery).version));
    },
  );

  route(
    r,
    { method: 'get', path: '/v1/packages/:id/export', summary: 'Download the scenario file', tags, request: { params: IdParams }, responses: { 200: { description: 'Scenario JSON (version 1)', schema: z.record(z.string(), z.unknown()) } } },
    async (req, res) => {
      const { fileName, body: text } = await svc.exportPackage(params(req, IdParams).id);
      res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
      res.type('application/json').send(text);
    },
  );

  route(
    r,
    { method: 'get', path: '/v1/packages/:id/portfolio', summary: 'Portfolio under supervision plus this package’s own contracts, by warning', tags, request: { params: IdParams }, responses: { 200: { description: 'Contracts', schema: z.object({ items: z.array(Contract) }) } } },
    async (req, res) => {
      res.json(await svc.portfolio(params(req, IdParams).id));
    },
  );

  return r;
}
