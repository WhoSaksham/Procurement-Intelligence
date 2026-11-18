# Node/Express + MongoDB backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all domain data and business logic out of the Next.js app into a new Node/Express/MongoDB service (`services/api`), make the graph service read its seed from MongoDB with domain-overlapping nodes derived, and turn the web app into a pure API client.

**Architecture:** Browser → Next.js `/api/[...path]` pass-through → Node API (Express 5, Mongoose) → MongoDB; the API also proxies the Python graph service with snapshot fallback. The API seeds MongoDB from `data/seed/` (repo root), deriving graph nodes for countries, portfolio contracts and passages from domain collections. The web app uses TanStack Query for server state and a single-writer queue for live edits.

**Tech Stack:** Node 24+, TypeScript 5.9, Express 5.3, Mongoose 9.12, zod 4.6, @asteasolutions/zod-to-openapi 9.1, pino 10 / pino-http 11, helmet 8, Vitest 5.1, supertest 7.3, mongodb-memory-server 11.3, tsx 4.23; @tanstack/react-query 5.108 in the web app; pymongo (latest stable at `uv add` time) in the graph service; MongoDB 8 in Docker.

**Spec:** `docs/superpowers/specs/2026-11-18-express-mongodb-backend-design.md` — read it before starting any task.

## Global Constraints

- **Git: never run `git commit` without the user's explicit approval for that commit. No `Co-Authored-By` or any AI attribution line.** This plan has no per-task commits; at the end, ask the user once for approval of one commit (or how they want it split).
- No sign-in, sessions, users or roles. Sign-off stays "type your name".
- Forecasting maths and recommendation rules move unchanged: every assertion in today's `apps/web/lib/model.test.ts` must pass unchanged against the moved code.
- After Task 11, `apps/web` must not import `predict`, `checkCriteria`, `recommendations`, `buildContract`, `hydrate`, or anything from `apps/web/data/` (the directory is deleted).
- Graph service API contract and Semantica usage do not change.
- Pin exact versions (no `^`/`~`) for new dependencies in `services/api/package.json` and for `@tanstack/react-query` in the web app.
- Every `/v1` API route requires `X-API-Key` (`API_KEY`, default `dev-key`); `/health` and `/ready` are open. Interactive docs only when `EXPOSE_DOCS=true`.
- All API errors are `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, `instance`, `requestId`; validation errors add `errors: [{ path, message }]`.
- Problem `type` URIs: `https://procurement.dev/problems/<slug>` with slugs `validation`, `not-found`, `version-conflict`, `example-read-only`, `unauthorized`, `internal`.
- Tests never need network MongoDB or third-party servers (mongodb-memory-server in unit/integration tests).
- No visual redesign. Only additions: package switcher, "updating" indicator, "Backend unreachable" state, "Reset events" control.
- Example package: stable id `example`, `example: true`, read-only in the API.

## Review Focus

1. **Typing fast then switching package before the PATCH lands** — the pending edit must go to the package it was made on, never the newly selected one. Test in Task 10 (`write queue binds edits to the package id at enqueue time`).
2. **Editing the example twice quickly** (two keystrokes before the fork returns) must create exactly one copy and apply both edits to it. Test in Task 10 (`forks the example once for a burst of edits`).
3. **Import of an old or hand-edited scenario file** with unknown fields, a method not allowed for its category, negative numbers, malformed contracts — must create a sane package, never a 500. Test in Task 6 (`import sanitises a malformed scenario`).
4. **API down mid-session** (not just at load) — the shell shows "Backend unreachable" with retry and recovers without a reload when the API returns. Test in Task 13 (`recovers when the API comes back`).
5. **Seeder rerun with an unchanged seed version must not touch user packages or Learn state, and a changed version must not touch user packages.** Test in Task 3 (`reseed keeps user packages`).

---

## File structure

```
data/seed/                              # single home of seed data (repo root)
  reference.json                        # sectors, categories, methods, defaults, layers, rating scale/names, ISR history
  countries.json
  sources.json
  contracts.json                        # portfolio
  roads.json
  content/package.json | pipeline.json | learn.json
  answers.json
  learn-events.json                     # { initial: [...], incoming: [...] }
  graph/nodes.json                      # graph-only nodes + ref nodes
  graph/edges.json, graph/supplier_registry.json, graph/suppliers_raw.json
  VERSION                               # integer seed version
services/api/
  package.json, tsconfig.json, eslint.config.mjs, vitest.config.ts, Dockerfile, .dockerignore, .env.example
  openapi.json                          # generated
  data/graph-snapshot.json              # moved from apps/web/data
  src/
    server.ts                           # process entry: connect, seed, listen
    app.ts                              # createApp(deps) → Express app (no listen)
    config.ts                           # zod-validated env
    db.ts                               # connect/disconnect
    http/ problem.ts, request-id.ts, api-key.ts, validate.ts, async.ts
    openapi/ registry.ts, export.ts     # registry + `npm run openapi`
    seed/ seeder.ts, derive-graph.ts, files.ts, cli.ts, export-graph-seed.ts
    modules/
      reference/  model.ts routes.ts
      sources/    model.ts routes.ts
      contracts/  model.ts routes.ts    # portfolio + roads
      content/    model.ts routes.ts
      ask/        model.ts service.ts routes.ts
      learn/      model.ts service.ts routes.ts
      packages/   model.ts schema.ts service.ts scenario.ts routes.ts
      analysis/   types.ts model.ts recommend.ts trace.ts analyse.ts
      graph/      proxy.ts fallback.ts types.ts routes.ts
  test/ setup.ts, helpers.ts, *.test.ts
services/graph/
  app/settings.py, app/seed.py          # + Mongo loader
  tests/fixtures/seed/*.json            # generated by services/api
apps/web/
  app/api/[...path]/route.ts            # replaces app/api/graph
  lib/api/ client.ts, schema.d.ts, queries.ts, write-queue.ts, current-package.ts, legacy-import.ts
  components/shell/ Providers.tsx, BackendState.tsx, PackageSwitcher.tsx
```

---

### Task 1: Seed data in one place

Export today's TS constants and the graph seed to `data/seed/`, splitting overlapping graph nodes into references.

**Files:**
- Create: `scripts/export-seed.mjs` (one-off; delete at the end of this task), `data/seed/**` as listed above, `data/seed/VERSION` containing `1`
- Read from: `apps/web/data/reference.ts`, `apps/web/data/sources.ts`, `apps/web/data/roads.ts`, `apps/web/views/{package,pipeline,learn,ask}/data.ts`, `services/graph/data/seed/*.json`

**Interfaces:**
- Produces seed JSON shapes used by Task 3:
  - `reference.json`: `{ sectors: string[], categories: Category[], methods: Record<Category,string[]>, defaultPackage: Package, defaultCriteria: Criteria, layers: Record<LayerId,{name,question,note}>, ratingScale: string[], ratingNames: Record<string,string>, isrHistory: RatingPoint[] }`
  - `countries.json`: `Country[]`; `sources.json`: `Record<string, Source>`; `contracts.json`: `Contract[]`; `roads.json`: `Record<contractId, Road>`
  - `content/package.json`: `{ risks, precedents, pastSpecs, conflict, peers, actual, winners }` (peers/actual as computed arrays, not the generator); `content/pipeline.json`: `{ feeds, stages, linking, run, icrTree, sampleChunk, quality }`; `content/learn.json`: `{ health, phases, kpis }`
  - `answers.json`: `{ supportMin: 0.75, answers: Answer[] }`; `learn-events.json`: `{ initial: LearnEvent[], incoming: LearnEvent[] }`
  - `graph/nodes.json`: graph-only nodes unchanged; overlapping nodes replaced by `{ id, type, ref: { collection: 'countries'|'contracts'|'sources', key }, column, label? }`. Refs: `KE` → countries/KE; `RRA-W-07`, `RRA-W-08`, `RRA-C-02`, `RRA-G-04` → contracts/<same id>; each `PS-<x>` → sources/<x> (keep the hand-written `label`, it is a short summary not present in the source).

- [ ] **Step 1:** Write `scripts/export-seed.mjs` that imports the TS modules with `tsx` (`npx tsx scripts/export-seed.mjs`) and writes the files above with 2-space JSON. `INJECTION`, `match`, `STEPS`, `traceSteps`, `weight`, `warnLevel`, `LEVEL` are code, not data — they move in Tasks 4–5.
- [ ] **Step 2:** Run it. Expected: files exist; `jq length data/seed/countries.json` → `8`; `jq length data/seed/contracts.json` → portfolio length; `jq '[.[]|select(.ref)]|length' data/seed/graph/nodes.json` → `15` (1 country + 4 contracts + 10 passages).
- [ ] **Step 3:** Check every PORTFOLIO contract id named in the graph refs exists in `contracts.json`, and every passage ref key exists in `sources.json` (one-line `node -e` check). Expected: no missing keys.
- [ ] **Step 4:** Delete `scripts/export-seed.mjs`. Leave `services/graph/data/seed/` in place until Task 8.

---

### Task 2: API service skeleton

**Files:**
- Create: `services/api/{package.json,tsconfig.json,eslint.config.mjs,vitest.config.ts,.env.example,.gitignore}`, `src/{app.ts,server.ts,config.ts,db.ts}`, `src/http/{problem.ts,request-id.ts,api-key.ts,validate.ts,async.ts}`, `test/{setup.ts,helpers.ts,app.test.ts}`

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env): Config` with `{ port: number (default 4000), mongoUrl: string (default 'mongodb://localhost:27017/procurement'), apiKey: string ('dev-key'), graphServiceUrl: string ('http://localhost:8000'), graphApiKey: string ('dev-key'), exposeDocs: boolean (false), seedDir: string (repo-root data/seed), logLevel: string ('info') }`
  - `createApp(deps: { config: Config; fetchImpl?: typeof fetch }): express.Express`
  - `class HttpProblem extends Error { constructor(status: number, slug: ProblemSlug, detail: string, extra?: Record<string, unknown>) }`
  - `validate<T>(schema: z.ZodType<T>, where: 'body'|'query'|'params')` middleware storing parsed value on `req.valid[where]`
  - `connectDb(url: string): Promise<void>`, `disconnectDb(): Promise<void>`
  - Test helpers: `startTestDb(): Promise<string>` (mongodb-memory-server URI), `testApp(overrides?): { app, request: supertest agent with X-API-Key preset }`
- Scripts: `dev` (tsx watch src/server.ts), `build` (tsc → dist), `start` (node dist/server.js), `test` (vitest run), `lint`, `typecheck`, `seed`, `openapi`, `export:graph-seed`.
- Module system: ESM (`"type": "module"`), `tsconfig` `module`/`moduleResolution` `NodeNext`, `strict: true`.

- [ ] **Step 1: Write failing tests** in `test/app.test.ts`:
  - `GET /health` → 200 `{ status: 'ok' }` without a key.
  - `GET /v1/anything` without key → 401, content-type `application/problem+json`, body `type` ends `/unauthorized`.
  - Unknown `/v1/nope` with key → 404 problem `not-found`.
  - Response echoes incoming `x-request-id`; generates one (UUID) when absent; body `requestId` equals header.
  - A route throwing a plain `Error` → 500 problem `internal` with no stack in the body.
  - `GET /docs` → 404 unless `exposeDocs: true`.
  - `GET /ready` → 200 `{ mongo: 'up', graph: 'up'|'down' }` when connected; 503 with `mongo: 'down'` when not.
- [ ] **Step 2:** `cd services/api && npm install && npm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement. helmet; `express.json({ limit: '1mb' })`; pino-http with request id; malformed JSON → 400 `validation`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` → all pass.

---

### Task 3: Models, seeder and graph derivation

**Files:**
- Create: `src/modules/*/model.ts` for reference, sources, contracts (+ roads), content, ask (answers), learn (events + state), packages; `src/seed/{files.ts,seeder.ts,derive-graph.ts,cli.ts,export-graph-seed.ts}`; `test/seed.test.ts`, `test/derive-graph.test.ts`

**Interfaces:**
- Consumes: Task 1 seed shapes; Task 2 `connectDb`.
- Produces:
  - Mongoose models: `ReferenceDoc` (single doc `_id: 'reference'`), `CountryModel` (`_id` = country id), `SourceModel` (`_id` = source id), `ContractModel` (`_id` = contract id), `RoadModel` (`_id` = contract id), `ContentModel` (`_id`: `'package'|'pipeline'|'learn'`, `data: Mixed`), `AnswerModel`, `LearnEventModel` (`{ seq, layer, title, updates, when, appliedAt|null, pool: 'initial'|'incoming' }`), `GraphNodeModel`, `GraphEdgeModel`, `SupplierRegistryModel`, `SupplierRawModel`, `SeedStateModel` (`_id: 'seed'`, `version`), `PackageModel` (see Task 6 for fields; defined here so the seeder can write the example).
  - Graph collection names exactly: `graphNodes`, `graphEdges`, `supplierRegistry`, `suppliersRaw` (the graph service reads these).
  - `deriveGraphNodes(nodes: SeedGraphNode[], lookup: { countries: Map<string,Country>; contracts: Map<string,Contract>; sources: Map<string,Source> }): GraphNode[]` — throws `Error('Dangling graph ref: <collection>/<key>')`.
  - Mapping (one function per type, output is the graph service's `SeedNode` shape `{ id, type, label, layer, attrs: Record<string,string>, source_id, locator, column }`):
    - Country → `label: name`, `layer: 'ledger'`, `attrs: { 'CPIA public sector mgmt': cpia.toFixed(1), 'WGI regulatory quality': `${rq}th pct`, 'FCV': fcv ? 'Yes' : 'No' }`, `source_id: 'wgi1'`, `locator: 'CPIA cluster D · WGI RQ 2024'`
    - Contract → `label: `${id} ${title-short}``, keep the hand-written label if the ref node has one; `layer: 'ledger'`; `attrs: { Value: `US$${value}M`, Signed: signed, Progress: `${actual}% of ${planned}% planned` }`; `source_id`/`locator` from the ref node if given, else `'ca2'` / `'Portfolio record'`
    - Passage → `label` from the ref node; `layer`, `source_id: key`, `locator` from the source document; `attrs: { Section: source.locator }`
    - Before writing the mapping, diff the derived output against today's `services/graph/data/seed/nodes.json` for these 15 nodes; where today's attrs differ, prefer the derived value only if it comes from the domain doc, and keep label/column from the ref. Record any intentional text change in the task notes.
  - `runSeed(opts: { seedDir: string; force?: boolean }): Promise<{ seeded: boolean; version: number }>` — compares `data/seed/VERSION` to `SeedStateModel.version`; when different (or `force`), in this order: replace reference/countries/sources/contracts/roads/content/answers/graph collections; add `weight = authority*independence*hindsight*corroboration` to each `content.package.conflict` row (replaces the web's `weight()`); reset Learn events to `initial` (applied) + `incoming` (pending); upsert the example package `_id: 'example'` from `defaultPackage`/`defaultCriteria` with `example: true, version: 1`; set the version. When equal: only create the example package if missing. Never touches packages where `example !== true`.
  - `npm run seed` → `cli.ts` (connect, `runSeed({ force: argv includes '--force' })`, disconnect).
  - `npm run export:graph-seed` → reads the four graph collections from a fresh in-memory seed and writes `services/graph/tests/fixtures/seed/{nodes,edges,supplier_registry,suppliers_raw}.json` (sorted by id/row_id, 2-space). `--check` flag exits 1 if files differ.

- [ ] **Step 1: Write failing tests** (`test/seed.test.ts`, `test/derive-graph.test.ts`):
  - `seeds every collection`: counts equal seed file lengths; `graphNodes` count equals `nodes.json` length.
  - `derived KE node carries the domain values`: `attrs['CPIA public sector mgmt'] === '3.6'`, `attrs['WGI regulatory quality'] === '38th pct'`.
  - `a changed domain value flows into the graph`: seed into memory with a modified `countries.json` (KE cpia 4.1) in a temp copy of the seed dir → KE node attr `'4.1'`.
  - `dangling ref fails loudly`: `deriveGraphNodes` with a ref to `contracts/NOPE` throws `Dangling graph ref: contracts/NOPE`.
  - `reseed keeps user packages`: create a user package doc; run `runSeed` twice with the same version (second returns `seeded: false`); bump version (temp seed dir) and run again → user package unchanged (deep equal), example package restored to defaults, Learn events reset.
  - `example package is created when missing`: delete it; `runSeed` same version → it exists again.
  - `graph fixture is up to date`: run export in `--check` mode logic against the committed fixture → no diff (this test is added in Step 5 after the fixture exists).
- [ ] **Step 2:** `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement models, `deriveGraphNodes`, `runSeed`, CLI, exporter.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `npm run export:graph-seed` → writes the fixture; add the `graph fixture is up to date` test; `npm test` → PASS.

---

### Task 4: Analysis module (moved logic)

**Files:**
- Create: `src/modules/analysis/{types.ts,model.ts,recommend.ts,trace.ts,analyse.ts}`, `test/model.test.ts` (moved from `apps/web/lib/model.test.ts`), `test/analyse.test.ts`
- Move from: `apps/web/lib/types.ts` (domain types), `apps/web/lib/model.ts`, `apps/web/lib/recommend.ts`, `traceSteps` from `apps/web/views/package/data.ts`, `buildContract`/`signoffBrief`/`isStale` from `apps/web/lib/scenario.ts`

**Interfaces:**
- Consumes: reference data (countries, methods) — the moved `model.ts` must not import seed files directly; it takes a `Ref` argument.
- Produces:
  - `interface Ref { countries: Country[]; methods: Record<Category, string[]> }` — all moved functions gain `ref: Ref` as their **first** parameter, otherwise signatures unchanged: `country(ref, id, custom)`, `allCountries(ref, custom)`, `predict(ref, pkg, custom, stringency)`, `eligibility(ref, pkg, method)`, `compareMethods(ref, pkg, custom, stringency)`, `bestMethod(ref, pkg, custom, stringency)`, `benchmarkCriteria(pkg, c)`, `comparables(ref, pkg, custom)`, `benchmarkDays(pkg)`, `cohortSample(ref, pkg, custom, n?)`, `checkCriteria(pkg, cr)`, `recommendations(ref, pkg, result, custom)`, `traceSteps(ref, pkg, custom)`, `buildContract(draft, n)`, `isStale(signoff, pkg, criteria)`.
  - `analyse(ref: Ref, doc: { pkg; criteria; countries; contracts; signoff }): Analysis` where
    ```ts
    interface Analysis {
      country: Country;                               // resolved current country
      check: CriteriaCheck;
      prediction: Omit<Prediction, 'cdf'> & { onTime: number };   // onTime = cdf(pkg.plannedDays)
      atBenchmark: Omit<Prediction, 'cdf'>;          // predict(ref, pkg, custom, 0) — TenderColumn
      curve: { t: number; model: number; history: number }[];     // 121 points, same grid and rounding as DurationCurve today
      methods: MethodOption[]; best: string | null;
      comparables: Comparables; sample: number[]; benchmarkDays: number;
      recommendations: Recommendation[];
      trace: Step[];
      stale: boolean;
    }
    ```
    The curve grid: `maxT = max(360, ceil(p80*1.6/60)*60)`, `t_i = round(i/120*maxT)`, `model = round(cdf(t),4)`, `history = round(empiricalCdf(sample)(t),4)` — exactly today's `DurationCurve` computation, moved.

- [ ] **Step 1:** Move `model.test.ts` into `test/`, change only imports and add the `ref` argument (built from `data/seed/` files) to calls. Add `test/analyse.test.ts`:
  - `analysis matches the parts`: for the default package, `analysis.prediction.p50` ≈ `170.15514296434228` (6 dp), `prediction.onTime` equals `predict(...).cdf(120)`, `curve.length === 121`, `curve[0].t === 0`, `atBenchmark.p50` equals `predict(ref,pkg,[],0).p50`.
  - `stale is false right after sign-off and true after a change`.
  - `analysis is JSON-serialisable`: `JSON.parse(JSON.stringify(a))` deep-equals `a`.
  - `buildContract` cases moved from `apps/web/lib/scenario.test.ts` / `store.test.ts` unchanged.
- [ ] **Step 2:** `npm test` → FAIL (modules missing).
- [ ] **Step 3:** Move the code; add `ref` threading; implement `analyse`.
- [ ] **Step 4:** `npm test` → PASS, every moved assertion unchanged.

---

### Task 5: Read endpoints — reference, sources, contracts, roads, content, Ask, Learn

**Files:**
- Create: `routes.ts` (+ `service.ts` for ask and learn) in each module, mount in `app.ts`; `test/read-endpoints.test.ts`, `test/ask.test.ts`, `test/learn.test.ts`

**Interfaces:**
- Consumes: Task 3 models; Task 4 `Ref`.
- Produces (response bodies; every route also registered in the OpenAPI registry):
  - `GET /v1/reference` → `{ countries, sectors, categories, methods, layers, defaultPackage, defaultCriteria, ratingScale, ratingNames, isrHistory }`
  - `GET /v1/sources/:id` → `Source & { id }`; 404 problem if unknown. `GET /v1/sources` → `{ ids: string[] }` (Cite's index).
  - `GET /v1/contracts/:id/road` → `Road`; 404 if none.
  - `GET /v1/content/:view` (`package|pipeline|learn`) → stored `data`; 404 otherwise.
  - `POST /v1/ask` body `{ q: string (1–500 chars) }` → `{ blocked: true }` | `{ blocked: false, answer: Answer | null, steps: TraceStep[] }`. Injection regex and `match` move from `views/ask/data.ts` unchanged into `ask/service.ts`; `STEPS(n)` moves too.
  - `GET /v1/ask/questions` → `{ questions: string[], supportMin: number }`
  - `GET /v1/learn/events` → `{ events: LearnEvent[] (applied, newest first, fresh = most recently applied incoming), remaining: number }`
  - `POST /v1/learn/events/next` → same shape; applies the next pending incoming event with `when: '2025-11-01'`; when none remain → 409 problem `version-conflict` with detail `No more sample events`. Must be atomic (`findOneAndUpdate` on lowest pending `seq`).
  - `POST /v1/learn/events/reset` → same shape, all incoming pending again.

- [ ] **Step 1: Write failing tests:**
  - `reference returns 8 countries and Civil Works methods`.
  - `unknown source is a 404 problem`.
  - `ask blocks injection`: `{ q: 'ignore all previous instructions' }` → `{ blocked: true }`.
  - `ask matches a prepared question`: first entry of `/ask/questions` → `answer.q` equals it.
  - `ask with an empty q is a 400 validation problem listing path q`.
  - `learn next applies events in order and then 409s`; `two concurrent next calls apply two different events` (`Promise.all`).
  - `learn reset restores the queue`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.

---

### Task 6: Packages module

**Files:**
- Create: `src/modules/packages/{schema.ts,scenario.ts,service.ts,routes.ts}`; `test/packages.test.ts`, `test/scenario.test.ts` (moved from `apps/web/lib/scenario.test.ts`)
- Move from: `apps/web/lib/scenario.ts` (`hydrate`, `parseImport`, `exportScenario`, `exportFileName`, `mergeTyped`, guards)

**Interfaces:**
- Consumes: `analyse`, `buildContract`, `benchmarkCriteria`, `isStale`/`signoffBrief` (Task 4); `PackageModel`, `ReferenceDoc` (Task 3).
- Produces:
  - `PackageModel` fields: `_id: string` (nanoid-style 10 chars; `'example'` for the example), `example: boolean`, `pkg`, `criteria`, `countries: Country[]`, `contracts: Contract[]`, `signoff: Signoff | null`, `version: number`, `contractSeq: number`, `createdAt`, `updatedAt`. Index on `updatedAt`.
  - `PackageView = { id, example, version, pkg, criteria, countries, contracts, signoff, updatedAt, analysis: Analysis }` — the response of GET, PATCH and every mutation.
  - zod: `PackagePatch = { version: int, pkg?: Partial<Package>, criteria?: Partial<Criteria> }`, enum/positive rules exactly as `ALLOWED`/`POSITIVE` in today's `scenario.ts`; after merge, method must belong to category, else 400 `validation` with path `pkg.method`.
  - Endpoints and rules:
    - `GET /v1/packages` → `{ items: { id, name, country, example, signedOff: boolean, updatedAt }[] }` example first, then `updatedAt` desc.
    - `POST /v1/packages` body `{ fromId?: string, name?: string }` → 201 `PackageView`; with `fromId`, copies content; name defaults to `<source name> (copy)` (or default package name without `fromId`); `signoff` is copied **as null**.
    - `GET /v1/packages/:id` → `PackageView`; 404 problem.
    - `PATCH /v1/packages/:id` → merge, `version + 1`. Atomic: `findOneAndUpdate({ _id, version, example: false }, …)`; if no match, look up the doc: missing → 404; `example` → 409 `example-read-only`; else 409 `version-conflict` with `current: PackageView`.
    - Every mutation below also requires `version` in the body and follows the same conflict rules: `POST /:id/benchmark`, `PUT /:id/countries/:countryId` (body `{ version, country }`), `DELETE /:id/countries/:countryId?version=n`, `POST /:id/contracts` (body `{ version, draft: ContractDraft }`, id `USR-<nn>` from atomic `contractSeq` increment), `DELETE /:id/contracts/:contractId?version=n`, `POST /:id/signoff` (body `{ version, name: 1–80 chars trimmed }`), `POST /:id/reset` (restore content from the example, keep id, signoff null).
    - `DELETE /v1/packages/:id` → 204; example → 409 `example-read-only`.
    - `GET /v1/packages/:id/export` → `content-disposition: attachment; filename="<exportFileName>"`, body `exportScenario` JSON (`version: 1`).
    - `POST /v1/packages/import` body = raw scenario JSON (≤1 MB) → 201 `PackageView` (new package, `example: false`); `parseImport` errors → 400 `validation` with today's messages (`Not valid JSON`, `Not a scenario file`).
    - `GET /v1/packages/:id/portfolio` → `{ items: Contract[] }` = seeded portfolio + package contracts, sorted by `warning` desc.

- [ ] **Step 1: Write failing tests** (`test/packages.test.ts`), each against a fresh seeded in-memory DB:
  - `lists the example first`.
  - `create copies a package and clears signoff`.
  - `patch saves, bumps version and returns analysis` (`pkg.plannedDays: 200` → `version 2`, `analysis.prediction.onTime` changes).
  - `patch with a stale version is a 409 with the current document`.
  - `patch on the example is 409 example-read-only and the example is unchanged`; same for delete, signoff, benchmark, contracts, countries.
  - `patch rejects a method outside the category` (400, path `pkg.method`).
  - `patch rejects negative value` (400).
  - `concurrent patches with the same version: exactly one wins` (`Promise.all` two PATCHes → one 200, one 409).
  - `add contract computes warning and id USR-01, then USR-02`; `concurrent adds get distinct ids`.
  - `signoff then patch makes analysis.stale true`.
  - `reset restores example content and keeps id`.
  - `export then import round-trips pkg, criteria, countries, contracts`.
  - `import sanitises a malformed scenario` (Review Focus 3): body `{ pkg: { value: -3, method: 'QCBS', category: 'Civil Works', bogus: 1 }, contracts: [{ id: 1 }] }` → 201; `pkg.value === 18.4`, `pkg.method === 'RFB, open international'`, no `bogus`, `contracts: []`.
  - `import of non-JSON is 400 'Not valid JSON'`.
  - `portfolio merges own contracts sorted by warning`.
  - `unknown package is a 404 problem on every route`.
- [ ] **Step 2:** Move `scenario.test.ts` with imports adjusted; `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.

---

### Task 7: Graph proxy in the API, OpenAPI contract

**Files:**
- Create: `src/modules/graph/{proxy.ts,fallback.ts,types.ts,routes.ts}`, `src/openapi/{registry.ts,export.ts}`, `services/api/openapi.json` (generated), `test/graph-proxy.test.ts`, `test/openapi.test.ts`
- Move: `apps/web/lib/graph/{proxy.ts,fallback.ts,types.ts}` and their tests `proxy.test.ts`, `fallback.test.ts`; `apps/web/data/graph-snapshot.json` → `services/api/data/graph-snapshot.json`
- Modify: `scripts/snapshot.mjs` (repo root) to write the snapshot to `services/api/data/` and keep regenerating `apps/web/lib/graph/schema.d.ts`

**Interfaces:**
- Consumes: Task 2 `createApp` deps (`fetchImpl`, `config.graphServiceUrl`, `config.graphApiKey`).
- Produces:
  - `GET /v1/graph/:path*` and `POST /v1/graph/suppliers/resolve` with today's envelope `{ source: 'live'|'snapshot', data } | { source, error }` and `x-graph-source` header; same segment validation, 2 s timeout, fallback on unreachable/timeout/401/5xx, 404/422 passed through. `health` maps to the graph service's `/health`. Forward `x-request-id`.
  - `E2E_GRAPH_DOWN=1` env (replaces web's `simulateDown`) forces snapshot answers.
  - `npm run openapi` writes `openapi.json` (OpenAPI 3.1) from the registry; `--check` exits 1 on diff.

- [ ] **Step 1:** Move the proxy/fallback tests, adapted to call the Express route via supertest with a stub `fetchImpl`: live 200; 404 passthrough; 401/500/timeout/network → snapshot; bad segment `..` → 404. Add `openapi.test.ts`: `openapi document is up to date` (check mode) and `every mounted /v1 route is in the document` (walk the Express router stack).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement; run `npm run openapi`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` → PASS.

---

### Task 8: Graph service reads MongoDB

**Files:**
- Modify: `services/graph/app/settings.py` (add `mongo_url: str | None = None`, `mongo_db: str = 'procurement'`; `seed_dir` default → `tests/fixtures/seed`), `services/graph/app/seed.py` (add `load_seed_from_mongo(url, db) -> Seed`; `load` chooses by `mongo_url`), `services/graph/app/main.py` lifespan, `services/graph/pyproject.toml` (+ `pymongo`; dev + `mongomock`), `services/graph/tests/conftest.py`, `services/graph/.env.example`
- Delete: `services/graph/data/seed/` (its content now lives in `data/seed/graph/` and the generated fixture)
- Test: `services/graph/tests/test_seed_mongo.py`

**Interfaces:**
- Consumes: collection names `graphNodes`, `graphEdges`, `supplierRegistry`, `suppliersRaw` (Task 3); documents carry Mongo `_id` which the loader drops; field names identical to the JSON fixture.
- Produces: `load_seed_from_mongo(url: str, db: str, client_factory=MongoClient) -> Seed` running the same pydantic validation and the same dangling-edge checks as `load_seed`.

- [ ] **Step 1: Write failing test** `test_mongo_loader_matches_fixture`: insert the fixture files into `mongomock.MongoClient()` collections; `load_seed_from_mongo(..., client_factory=lambda url: mock)` equals `load_seed(fixture_dir)`. And `test_mongo_loader_rejects_dangling_edge`.
- [ ] **Step 2:** `uv add pymongo && uv add --dev mongomock && uv run pytest -q` → new tests FAIL, others PASS against the fixture dir.
- [ ] **Step 3:** Implement; startup logs which source it loaded from.
- [ ] **Step 4:** `uv run pytest -q` → all PASS. Regenerate `openapi.json` with `uv run python scripts/export_openapi.py` → no diff expected.

---

### Task 9: Web — API client, proxy route, providers, backend state

**Files:**
- Create: `apps/web/app/api/[...path]/route.ts`, `apps/web/lib/api/{client.ts,schema.d.ts,queries.ts}`, `apps/web/components/shell/{Providers.tsx,BackendState.tsx}`, `apps/web/lib/api/proxy.test.ts`
- Modify: `apps/web/app/layout.tsx` (wrap in `Providers`, render `BackendState`), `apps/web/package.json` (+ `@tanstack/react-query@5.108.0`; script `types:api`: `openapi-typescript ../../services/api/openapi.json -o lib/api/schema.d.ts`), `apps/web/lib/graph/client.ts` (fetch `/api/v1/graph/...`)
- Delete: `apps/web/app/api/graph/`

**Interfaces:**
- Consumes: `services/api/openapi.json` (Task 7).
- Produces:
  - Route handler: forwards `GET|POST|PUT|PATCH|DELETE /api/<path>` → `${API_URL}/<path>` (env `API_URL`, default `http://localhost:4000`; `API_KEY` default `dev-key`), path segments validated with `/^[\w.-]+$/`, query string preserved, body streamed, 10 s timeout, response status/headers (`content-type`, `content-disposition`, `x-graph-source`, `x-request-id`) passed through; unreachable/timeout → 503 problem `{ type: …/unreachable }`.
  - `class ApiError extends Error { status: number; problem: Problem }`; `api<T>(path, init?) : Promise<T>` throws `ApiError` on non-2xx.
  - Typed functions in `client.ts` for every endpoint in Tasks 5–7 (names: `getReference`, `getSource`, `getSourceIds`, `getRoad`, `getContent`, `ask`, `getQuestions`, `getLearnEvents`, `nextLearnEvent`, `resetLearnEvents`, `listPackages`, `createPackage`, `getPackage`, `patchPackage`, `deletePackage`, `resetPackage`, `applyBenchmark`, `upsertCountry`, `removeCountry`, `addContract`, `removeContract`, `signOff`, `exportPackageUrl`, `importPackage`, `getPortfolio`).
  - `queries.ts`: query-key factory `qk = { reference: ['reference'], source: (id) => ['source', id], packages: ['packages'], pkg: (id) => ['package', id], portfolio: (id) => ['portfolio', id], content: (v) => ['content', v], learn: ['learn'], questions: ['questions'], road: (id) => ['road', id] }`; hooks `useReference()`, `useContent(view)`, etc. Reference/content/sources/roads/questions use `staleTime: Infinity`.
  - `BackendState`: when `/api/v1/reference` fails with 503/network, replaces the main content area with "Backend unreachable" + Retry (refetch all); rail, ⌘K and theme stay usable. Polls every 5 s while down and recovers on its own.

- [ ] **Step 1: Write failing tests** `lib/api/proxy.test.ts` (Vitest, stub fetch): forwards method/body/query and `X-API-Key`; rejects `..` segment with 404; maps fetch rejection to 503 problem; passes `content-disposition` through.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement; `npm run types:api`.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS (views still on old imports at this point is fine).

---

### Task 10: Web — current package, write queue, example fork, legacy import

**Files:**
- Create: `apps/web/lib/api/{write-queue.ts,current-package.ts,legacy-import.ts}`, tests `write-queue.test.ts`, `legacy-import.test.ts`; `apps/web/components/shell/PackageSwitcher.tsx`
- Modify: `apps/web/lib/ui-store.ts` (drop `PORTFOLIO` import; `contract` defaults to `null`, views pick the first portfolio item), `apps/web/components/shell/PackageBar.tsx` (mount switcher)
- Delete: `apps/web/lib/store.ts`, `store.test.ts`, `scenario.ts`, `scenario.test.ts`, `components/shell/ScenarioHydrator.tsx`

**Interfaces:**
- Consumes: client functions (Task 9).
- Produces:
  - `useCurrentPackage(): { id: string; setId(id: string): void }` — Zustand store persisted to `localStorage['procurement-current-package']` (try/catch), overridden by `?pkg=` on load; default `'example'`. If `getPackage(id)` 404s → `setId('example')` + toast `That package no longer exists — showing the example`.
  - `createWriteQueue(deps: { patch: (id, body) => Promise<PackageView>; fork: (fromId) => Promise<PackageView>; onApplied(view: PackageView): void; onSwitch(id: string): void; onConflict(view: PackageView): void; delayMs?: number /* 150 */ })` returning `{ edit(id: string, version: number, isExample: boolean, change: { pkg?: Partial<Package>; criteria?: Partial<Criteria> }): void; flush(): Promise<void> }`. Rules:
    - Edits are keyed by the package id **given at `edit` time** (Review Focus 1).
    - Coalesce pending edits per id (shallow merge per `pkg`/`criteria`); at most one request in flight per id; next request uses the version returned by the previous.
    - Typing debounce 150 ms; `flush()` sends immediately (used on pointer-up after a drag; drags call `edit` throttled at 150 ms by the caller).
    - If `isExample`: first call `fork('example')` once (later edits during the fork wait on the same promise — Review Focus 2), call `onSwitch(newId)`, then patch the new id with all coalesced edits.
    - On 409 `version-conflict`: `onConflict(current)`, re-apply pending change once against `current.version`; on a second conflict, drop the edit and `onConflict` again. The `usePackage` wiring of `onConflict` shows toast `Updated elsewhere — your change was re-applied` (or `… your change was discarded` on the second conflict).
    - On 404: drop pending edits for that id.
  - `usePackage()` hook: `{ view: PackageView | undefined; pkg; criteria; analysis; updating: boolean; edit(change); }` — local form state shows edits immediately (optimistic `pkg`/`criteria` merged over the last server view); `analysis` is always the last server response (never blanked).
  - Non-PATCH mutations (benchmark, countries, contracts, sign-off, reset) go through one helper `mutate(id, fn)` that also forks the example first and refreshes `qk.pkg`/`qk.portfolio`/`qk.packages`.
  - `importLegacyScenario(storage: Storage, importFn): Promise<string | null>` — if `procurement-scenario-v1` exists, `importFn(raw)` → returns new id and removes the key; on failure leaves the key and returns null. Called once from `Providers`; toast `Your saved scenario was imported as “<name>”`; switches to it.
  - `PackageSwitcher`: list (example first, labelled "Example"), New, Duplicate, Delete (hidden for the example; confirm dialog). Keyboard accessible, fits 390 px.

- [ ] **Step 1: Write failing tests** (`write-queue.test.ts`, fake timers, stub `patch`/`fork`):
  - `coalesces a burst of edits into one patch`.
  - `never has two requests in flight for one package`.
  - `uses the version returned by the previous patch`.
  - `write queue binds edits to the package id at enqueue time` (edit on A, then edit on B before A's debounce → one patch to A with A's change, one to B with B's).
  - `forks the example once for a burst of edits` (three edits with `isExample` → `fork` called once, one patch on the new id containing all three changes, `onSwitch` once).
  - `re-applies once after a version conflict, then gives up`.
  - `flush sends immediately`.
  - `legacy-import.test.ts`: imports and clears the key; leaves the key on failure; no key → null and no call.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS for these files.

---

### Task 11: Web — move every view to the API, delete frontend data and logic

**Files:**
- Modify (replace imports listed in the spec's "Removed from the web app"): `app/error.tsx` (reset clears current-package id instead of scenario), `components/evidence/{Cite,EvidenceSheet}.tsx` (`getSourceIds`/`getSource`, `layers` from reference), `components/shell/{PackageBar,DataControls,CommandPalette}.tsx`, `components/charts/index.tsx` (`DurationCurve` takes `curve` points instead of `result`+`sample`; `RatingChart` takes `scale`/`names` from reference; no domain computation left), `components/map/{MapView,SiteMap}.tsx` (`getRoad`, `getPortfolio`), `views/package/*.tsx`, `views/ask/AskView.tsx` (`ask`, `getQuestions`), `views/learn/LearnView.tsx` (events from API + "Reset events" button), `views/pipeline/PipelineView.tsx` (`useContent('pipeline')`), `lib/format.ts` (own `pct`/`days`/`riskLevel`, plus `warnLevel` and `LEVEL` moved from `views/package/data.ts` — presentation only)
- Delete: `apps/web/data/` (all), `views/{package,pipeline,learn,ask}/data.ts`, `lib/model.ts`, `lib/model.test.ts`, `lib/recommend.ts`, `lib/use-plan.ts`, domain parts of `lib/types.ts` (re-export types from `lib/api/schema.d.ts` instead), `lib/graph/{proxy,fallback}.ts` and their tests

**Interfaces:**
- Consumes: `usePackage`, `useCurrentPackage`, `mutate`, query hooks (Tasks 9–10); `Analysis` fields (Task 4).
- Mapping of today's call sites to analysis fields: `usePlan().check` → `analysis.check`; `.result` → `analysis.prediction`; `.best` → `analysis.best`; `.portfolio` → `getPortfolio`; `result.cdf(pkg.plannedDays)` → `analysis.prediction.onTime`; `predict(pkg,countries,0)` in TenderColumn → `analysis.atBenchmark`; `cohortSample` → `analysis.sample`; `comparables` → `analysis.comparables`; `compareMethods` → `analysis.methods`; `benchmarkDays` → `analysis.benchmarkDays`; `recommendations` → `analysis.recommendations`; `traceSteps` → `analysis.trace`; `isStale` → `analysis.stale`; `country(...)` → `analysis.country`; `allCountries(countries)` → reference countries with the package's custom countries overriding by id (pure list merge in `PackageBar`, no model call); `weight(r)` for the conflict table → add `weight` to each `conflict` row in `content/package.json` at seed time (Task 1 data, computed by the seeder as `authority*independence*hindsight*corroboration`).
- ComparablesStrip drag: call `edit({ pkg: { plannedDays } })` throttled at 150 ms during drag and `flush()` on release. Show the "updating" indicator (small muted spinner next to the summary strip's on-time figure) while `updating`.

- [ ] **Step 1:** Update views file by file; after each file, `npm run typecheck` to catch remaining imports.
- [ ] **Step 2:** Delete the files listed above.
- [ ] **Step 3: Verify the anti-goal:** `grep -rnE "from '@/data/|lib/model'|lib/recommend'|lib/scenario'|lib/use-plan'|predict\(|checkCriteria\(|buildContract\(|hydrate\(" apps/web/app apps/web/components apps/web/views apps/web/lib` → no output.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test && npm run build` → all pass.

---

### Task 12: Compose, Dockerfiles, CI, docs

**Files:**
- Create: `services/api/Dockerfile` (multi-stage, Node 24 slim, build context = repo root so `data/seed` is copied; runs as non-root), `services/api/.dockerignore`
- Modify: `docker-compose.yml`, `.github/workflows/ci.yml`, `README.md`, `docs/architecture.md`, `services/graph/.env.example`, `services/api/.env.example`, root `package.json` (scripts `seed`, `snapshot` paths)

**Interfaces / values:**
- Compose services:
  - `mongo`: `mongo:8`, volume `mongo-data:/data/db`, healthcheck `mongosh --quiet --eval "db.adminCommand('ping').ok"`, port `127.0.0.1:27017:27017`.
  - `api`: build `{ context: ., dockerfile: services/api/Dockerfile }`, env `MONGO_URL=mongodb://mongo:27017/procurement`, `API_KEY`, `GRAPH_SERVICE_URL=http://graph:8000`, `GRAPH_API_KEY`; port `127.0.0.1:4000:4000`; healthcheck on `/ready`; depends on `mongo` healthy. The API seeds on startup before listening, so `/ready` healthy implies the seed exists.
  - `graph`: env adds `MONGO_URL=mongodb://mongo:27017`, `MONGO_DB=procurement`; depends on `api` healthy (guarantees the graph collections are seeded).
  - `web`: env `API_URL=http://api:4000`, `API_KEY`; drops `GRAPH_*`; depends on `api` healthy.
- CI: new job `api` (Node 24, `npm ci`, lint, typecheck, test, `npm run openapi -- --check`, `npm run export:graph-seed -- --check`); `e2e` job runs `docker compose up -d --build --wait mongo api graph` and sets `API_EXTERNAL=1`; on failure dump `docker compose logs api graph`.
- Docs: rewrite the architecture diagram, request flow, API table (both services), env table (`MONGO_URL`, `API_KEY`, `API_URL`, `GRAPH_SERVICE_URL`, `GRAPH_API_KEY`, `EXPOSE_DOCS`), testing table, hosting (MongoDB Atlas free tier; API on Render/Cloud Run next to the graph service; web on Vercel). README quick start without Docker: start Mongo (`docker compose up -d mongo`), then API (`cd services/api && npm i && npm run dev`), graph (with `MONGO_URL`), web.

- [ ] **Step 1:** Write the files.
- [ ] **Step 2:** `docker compose up --build -d --wait` → all four healthy; `curl -s localhost:4000/health` → `{"status":"ok"}`; `curl -s -H 'X-API-Key: dev-key' localhost:4000/v1/graph/health` → `"source":"live"`; open http://localhost:3000/package → renders the example.
- [ ] **Step 3:** `docker compose down` (keep the volume).

---

### Task 13: Playwright against the full stack

**Files:**
- Modify: `apps/web/playwright.config.ts` (webServers: Mongo via `docker compose up -d --wait mongo` unless `API_EXTERNAL=1`; graph with `MONGO_URL`; API on port 4100 with `MONGO_URL=mongodb://localhost:27017/procurement-e2e`, `npm run seed -- --force` before start; web with `API_URL=http://localhost:4100`), `apps/web/e2e/fixtures.ts` (replace `seedScenario` with `newPackage(partial?) → id` via the API using `request` fixture, auto-deleted after the test; keep `STORAGE_KEY` for the legacy test), existing specs that used `seedScenario` → `newPackage` + `?pkg=<id>`
- Create: `apps/web/e2e/packages.spec.ts`, `apps/web/e2e/backend.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Global-state tests (`learn` events, example package, API-down) are in files marked `test.describe.configure({ mode: 'serial' })` and reset what they change in `afterEach` (`POST /v1/learn/events/reset`).

- [ ] **Step 1: Write the new specs:**
  - `packages.spec.ts`: `editing the example forks a copy` (type in package bar on example → toast "Saved as your own copy", switcher shows the copy selected; reload `?pkg=example` → original value); `edits persist across reload`; `switcher creates, duplicates and deletes`; `a deleted package falls back to the example` (delete via API, reload with the old id → toast + example); `two tabs: the second sees the first's change and keeps its own edit`; `an old browser save is imported once` (init script sets `procurement-scenario-v1` → toast with name, key cleared, second reload no toast); `dragging the plan line updates the on-time figure`.
  - `backend.spec.ts`: `shows Backend unreachable when the API is down` (route `/api/v1/**` to 503) and `recovers when the API comes back` (unroute → content returns within 10 s without reload) — Review Focus 4.
  - Learn: `receive next event then reset events` in `views.spec.ts`.
- [ ] **Step 2:** `cd apps/web && npx playwright test` → all specs pass on desktop and phone, including the existing a11y, overflow and console-error checks.
- [ ] **Step 3:** `npm run test:e2e:dev` → hydration check passes.
- [ ] **Step 4:** Run the full suite a second time → still green (no order dependence).

---

### Task 14: Final verification and handoff

- [ ] **Step 1:** `cd services/api && npm run lint && npm run typecheck && npm test && npm run openapi -- --check && npm run export:graph-seed -- --check` → pass.
- [ ] **Step 2:** `cd services/graph && uv run pytest -q` → pass.
- [ ] **Step 3:** `cd apps/web && npm run lint && npm run typecheck && npm test && npm run build` → pass.
- [ ] **Step 4:** Anti-goal grep from Task 11 Step 3 → no output; `ls apps/web/data` → no such directory; `ls services/graph/data/seed` → no such directory.
- [ ] **Step 5:** Ask the user for approval to commit, proposing one commit (message: `Add Node/Express/MongoDB API service; move data and business logic out of the web app`) or a split they prefer. Do not push unless asked.
