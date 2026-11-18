# Procurement Intelligence: Node/Express + MongoDB backend

Date: 2026-11-18
Status: draft, awaiting approval (builder check done; questions answered 2026-11-18: graph nodes derived from domain data, example package protected)

## Intent

The app is shown as evidence of production-grade architecture. The previous rebuild (spec `2026-11-15-nextjs-semantica-playwright-design.md`) gave it a real frontend, a design system, a Python graph service and end-to-end tests, but every piece of business data and every piece of business logic still lives in the Next.js bundle: reference data in `apps/web/data/*.ts`, view content in `apps/web/views/*/data.ts`, the forecasting model and recommendation rules in `apps/web/lib/model.ts` and `lib/recommend.ts`, and the analyst's work in browser storage. That spec listed "no server-side persistence" as a non-goal.

This work reverses that. The main agenda is to **show backend capability**: a Node.js service that owns the domain data (in MongoDB) and the business logic, with the Next.js app reduced to a client of its API. There are two backend services after this: the existing Python graph service, and the new Node API, which is the system of record.

## Goals

1. A new service, `services/api`: Node.js, TypeScript, Express 5, MongoDB via Mongoose.
2. All domain data that is hard-coded in the frontend today moves into MongoDB and is served by the API (inventory below).
3. All business logic moves to the API: forecasting, method comparison, criteria checks, comparables, cohort sample, recommendations, contract warning scores, scenario validation/import, sign-off staleness, the Ask matcher and injection guard, agent trace steps. The frontend computes nothing domain-related.
4. The analyst's work (package, criteria, custom countries, own contracts, sign-off) is persisted in MongoDB. The app can hold **several saved packages**, not just one.
5. The web app talks to one backend: the Node API. The API calls the graph service and owns the graph snapshot fallback.
6. The graph service reads its seed records from MongoDB, and graph nodes that describe domain records (the country, the portfolio contracts, the evidence passages) are **derived from the domain collections**, so every fact has one copy.
7. The example package is protected, so the first thing any visitor sees is always the example as configured.
8. `docker compose up` runs MongoDB, the API, the graph service and the web app. CI runs API tests and the existing suites against the full stack.

## Non-goals

- **No sign-in, sign-up, sessions or user roles.** Every visitor sees and edits the same packages. Sign-off stays "type your name".
- No real World Bank ingestion. Seed data stays the current illustrative data, just stored in MongoDB.
- No LLM. "Ask the evidence" keeps keyword-matched prepared answers; only where it runs changes.
- No change to the forecasting maths or recommendation rules. They are moved, with their tests, not redesigned. Outputs must be identical.
- No visual redesign. Views look and behave as they do today, plus a package switcher.
- No change to the graph service's API contract or Semantica usage.

## Anti-goals (failure even if it works)

- **Logic left behind or duplicated in the frontend.** If `apps/web` still imports `predict`, `checkCriteria`, `recommendations`, `buildContract`, `hydrate` or any `data/*.ts` domain constant, the goal is missed.
- **Editing feels broken.** Typing in the package bar or dragging the plan line must not flicker, lose keystrokes, show stale results over newer ones, or blank out results while a request is in flight.
- **A blank page when the API is down.** The app shows a clear "backend unreachable" state with retry, not a crash or an empty screen.
- **Two copies of graph data** (JSON in the graph service and documents in Mongo) that can drift.
- **Flaky tests**, or tests that need a hosted MongoDB.
- **Losing the "least clicks" qualities**: ⌘K, number-key navigation, inline editing in the package bar, drag on the comparables strip.

## Constraints

- Node 24 in CI and Docker (Node 26 locally), npm. TypeScript throughout, matching `apps/web`.
- The existing graph service contract and its snapshot/types generation (`npm run snapshot`) keep working; the snapshot file moves with the fallback logic to the API.
- MongoDB 8 in Docker Compose; tests use `mongodb-memory-server` (no network dependency).
- Pin exact versions of new dependencies (latest stable at build time).
- Git: never commit without explicit approval for that commit; no co-author or AI attribution trailers.
- Sentinel-2 imagery licence note and attribution stay as they are.

## Approaches considered

How live should edits feel once the server owns the maths?

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **The server does all calculating.** Each edit is saved and the server returns fresh results. Requests are debounced/throttled while typing or dragging, latest response wins, and previous results stay on screen until new ones arrive. | Every result really comes from the backend. Dragging shows results ~100–200 ms after the pointer, not instantly. |
| B | Shared TypeScript package used by both: the browser shows an instant preview, the server result is the one saved. | Instant drag, but the same code runs in two places and the backend's ownership of logic is less clear. |
| C | Only data moves; logic stays in the browser. | Least work, but doesn't demonstrate backend capability, which is the point. |

The user chose **A**.

Also settled in conversation: no authentication of any kind; two backend services (existing Python graph service plus the new Node API that holds data and business logic).

## Architecture

```
browser ──► Next.js (apps/web)
              └─ /api/[...path] route handler ──HTTP + X-API-Key──► Node API (services/api)
                                                                      ├─ MongoDB (system of record)
                                                                      └─ /v1/graph/* ──HTTP + X-API-Key──► graph service (services/graph)
                                                                            └─ on timeout/401/5xx/unreachable: snapshot, source="snapshot"

graph service (FastAPI + Semantica)
  └─ at startup: reads graph seed collections from MongoDB (MONGO_URL), or from data/seed/graph/*.json when MONGO_URL is unset (tests)

seeding: services/api seeder ──► MongoDB (reference, evidence, content, portfolio, roads, graph seed)
```

- **Browser → Next → API.** The browser never sees the API URL or key; this mirrors the current graph proxy pattern. The Next route handler is a thin pass-through (path validation, header forwarding, timeout), no fallback.
- **API → graph service.** The current `lib/graph/proxy.ts` + `fallback.ts` + `data/graph-snapshot.json` move into the API. The frontend's graph client calls `/api/v1/graph/...` and still receives `{ source: 'live' | 'snapshot', data | error }`; the Live/Snapshot badge is unchanged.
- **Graph seed in MongoDB, derived where it overlaps domain data** (user's choice 1a). Today `services/graph/data/seed/nodes.json` repeats facts held elsewhere: country `KE` (CPIA, WGI, FCV), the portfolio contracts `RRA-W-07/W-08/C-02/G-04` (value, signed date, progress), and the `PS-*` passage nodes whose `source_id`s are the evidence sources. After this change:
  - The hand-written graph seed (`data/seed/graph/` at the repo root) keeps only graph-only entities (projects, historical awards `C1`–`C5`, ISRs, ICRs, lessons, guidance, agency, sector, …), all edges, the supplier registry and raw supplier rows.
  - Nodes for countries, portfolio contracts and passages are stored in the seed as **references** (`id`, `type`, `ref: { collection, key }`, `column`, optional label) and the API's seeder fills `label`, `layer`, `attrs`, `source_id` and `locator` from the referenced domain document, using one mapping function per node type.
  - The seeder writes the assembled `graphNodes`, `graphEdges`, `supplierRegistry`, `suppliersRaw` collections. The graph service reads them unchanged in format, so its pydantic models and API don't change.
  - The seeded portfolio contracts are not edited at runtime, so deriving at seed time is enough; no rebuild endpoint is needed. Contracts and countries that users add to a package are **not** added to the graph (designer's call; can come later).
  - The graph service's pytest suite reads a **generated** fixture, `services/graph/tests/fixtures/seed/*.json`, written by an API script (`npm run export:graph-seed`) from the assembled collections. It is committed like the web snapshot is, and CI fails if it is out of date, so it is an artifact, not a second hand-edited copy.

## The API service (`services/api`)

Stack: Express 5, Mongoose, zod for request/response validation, OpenAPI document generated from the zod schemas (e.g. `@asteasolutions/zod-to-openapi`), pino logging, helmet. Tests: Vitest + supertest + mongodb-memory-server.

Cross-cutting behaviour:

- **Service auth:** every `/v1` route requires `X-API-Key` (`API_KEY`), same as the graph service. `/health` (liveness) and `/ready` (Mongo connected; graph reachability reported but not required) are open.
- **Errors:** RFC 9457 `application/problem+json` for every error, with a request id. Validation errors list the failing fields.
- **Request id + structured logs:** `x-request-id` accepted or generated, echoed, included in every log line and forwarded to the graph service.
- **Optimistic concurrency on packages:** every package document has an integer `version`. Writes send the version they are based on; a mismatch returns `409` with the current document. (Two tabs editing the same package is the realistic case without users.)
- **Validation at the boundary:** the rules in today's `lib/scenario.ts` (allowed enums, positive numbers, method must belong to category, malformed signals/milestones dropped on import) become zod schemas and service functions.
- **Contract:** `services/api/openapi.json` is exported by a script; `apps/web` generates its TypeScript types from it (`openapi-typescript`), as it already does for the graph service.
- **Docs:** interactive docs off unless `EXPOSE_DOCS=true`, matching the graph service.

### Data model (MongoDB)

| Collection | Holds | Source today |
|---|---|---|
| `countries` | Seeded countries with CPIA, WGI RQ, FCV, imputed flag | `data/reference.ts` `COUNTRIES` |
| `reference` | Sectors, categories, methods per category, default package, default criteria, evidence layers | `data/reference.ts`, `data/sources.ts` `LAYERS` |
| `sources` | Evidence passages keyed by id (`ca1`, `isr2`, …) | `data/sources.ts` `SOURCES` |
| `contracts` | Portfolio contracts under supervision, with signals and milestones | `data/reference.ts` `PORTFOLIO` |
| `roads` | Road alignment and chainage segments per contract | `data/roads.ts` |
| `content` | Per-view illustrative content as typed documents: package (risks, precedents, past specs, conflict weights, peers/actual curves, winners), pipeline (feeds, stages, linking, run, ICR tree, sample chunk, quality), learn (health, phases, KPIs) | `views/*/data.ts` |
| `answers` | Prepared Ask answers with claims, citations and support scores | `views/ask/data.ts` |
| `learnEvents` | Feedback events; the "simulate incoming" queue and the applied events | `views/learn/data.ts` |
| `packages` | Saved packages: `pkg`, `criteria`, custom `countries`, own `contracts`, `signoff`, `version`, timestamps | browser storage today |
| `graphNodes`, `graphEdges`, `supplierRegistry`, `suppliersRaw` | Graph seed records | `services/graph/data/seed/*.json` |

Custom countries and own contracts stay scoped to their package, as they are in today's scenario. Own-contract ids (`USR-01`, …) are allocated per package, atomically, by the server.

### Seeding

- Seed files live under `data/seed/` at the repo root (JSON exported once from the current TS constants and graph seed).
- The API runs an idempotent, versioned seeder at startup: if the stored seed version differs from the files, reference/content/graph collections are replaced (graph nodes derived as described above). **User packages are never touched by the seeder.** The example package is owned by the seeder: it is (re)written from the seed files on every seed-version change and created if missing.

### The example package (user's choice 2a)

- The example package ("Rural roads rehabilitation, Phase II") has `example: true` and a stable id. It is read-only: the API rejects `PATCH`, `DELETE`, sign-off, country/contract changes and benchmark on it with `409` problem+json (`type: …/example-read-only`).
- The frontend makes this invisible: the first edit made on the example (any field, criteria, sign-off, adding a contract or country) calls `POST /packages` with `fromId` = the example, switches to the new copy (named "<example name> (copy)"), applies the edit there and shows a toast ("Saved as your own copy"). The example stays selectable from the switcher.
- Reset on a user package restores it to the example's content (keeping its id). Reset on the example is hidden.
- `npm run seed` runs the same seeder on demand.

### Endpoints (all under `/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/reference` | Countries, sectors, categories, methods, layers, defaults: everything the shell's selects need, in one call |
| GET | `/sources/:id` | One evidence passage (the evidence sheet) |
| GET | `/packages` | List saved packages (id, name, country, updated, signed off?) |
| POST | `/packages` | Create from defaults, or as a copy of `fromId` |
| GET | `/packages/:id` | Package document plus its analysis |
| PATCH | `/packages/:id` | Partial update of `pkg` and/or `criteria`, with `version`; returns document plus analysis |
| DELETE | `/packages/:id` | Delete a user package (the example cannot be deleted) |
| POST | `/packages/:id/reset` | Restore a user package to the example's content |
| POST | `/packages/:id/benchmark` | Apply benchmark criteria (today's `applyBenchmark`) |
| PUT / DELETE | `/packages/:id/countries/:countryId` | Upsert or remove a custom country |
| POST / DELETE | `/packages/:id/contracts[/:contractId]` | Add an own contract from a draft (server computes warning and signals) or remove one |
| POST | `/packages/:id/signoff` | Sign off by name; staleness is computed by the server and returned in the analysis |
| GET | `/packages/:id/export` | Scenario JSON, same shape as today's export (`version: 1`), as a download |
| POST | `/packages/import` | Create a new package from a scenario file (old exports and old browser saves load) |
| GET | `/packages/:id/portfolio` | Seeded portfolio plus this package's own contracts, sorted by warning |
| GET | `/contracts/:id/road` | Road segments for the site map |
| GET | `/content/:view` | Illustrative content for `package`, `pipeline`, `learn` |
| POST | `/ask` | `{ q }` → blocked (injection guard), matched answer with claims and trace steps, or no match |
| GET | `/ask/questions` | Suggested questions (palette and Ask view) |
| GET | `/learn/events` | Applied feedback events, newest first |
| POST | `/learn/events/next` | Apply the next incoming event (persisted, so it survives reload) |
| POST | `/learn/events/reset` | Restore the initial events |
| GET | `/graph/*` | Proxy to the graph service with snapshot fallback (`graph`, `full`, `nodes/:id`, `suppliers/clusters`, `analytics`); `POST /graph/suppliers/resolve` live only |

**Analysis** (returned by GET/PATCH package and the mutation endpoints) contains everything `use-plan.ts` and the views derive today: criteria check (findings, stringency, annual cash), prediction (P20/P50/P80, timeline drivers, re-tender/amendment/slippage risks with drivers), a sampled duration CDF for the curve chart (the `cdf` function can't be serialised; send points at the resolution the chart uses), method comparison and best method, comparables and cohort sample, benchmark days, recommendations, agent trace steps, and sign-off staleness. Formatting helpers (`pct`, `days`, `riskLevel`, `warnLevel`) are presentation and stay in the frontend.

### Module layout

`src/modules/<domain>/` with routes → service → repository per domain (`reference`, `sources`, `packages`, `analysis`, `contracts`, `content`, `ask`, `learn`, `graph`). The model and recommendation code moves to `src/modules/analysis/` as pure functions; its existing Vitest suite (`model.test.ts`) moves with it and must pass unchanged in its assertions.

## Frontend changes (`apps/web`)

- **Server state via TanStack Query.** Reference data, packages, analysis, content, Ask and Learn are queries/mutations. Zustand stays only for UI state (`ui-store.ts`) and the current package id.
- **Current package.** A package switcher in the package bar (list, new, duplicate, delete). The current id is remembered in browser storage as a convenience and can be deep-linked with `?pkg=<id>`. Routes stay as they are (`/package`, `/map`, …). *(Designer's calls, from the builder check:)*
  - With no `?pkg` and no remembered id, the app opens the example package.
  - If the remembered or linked package no longer exists (deleted by someone else), or a write returns `404`, the app switches to the example package and says so in a toast.
- **Learn queue.** Applied events are global and persisted, so the Learn view gets a visible "Reset events" control that calls `/learn/events/reset`; otherwise the first visitor to exhaust the queue empties it for everyone. *(Designer's call.)*
- **Test isolation.** Playwright tests create and delete their own packages and never depend on the state of the example package; tests that touch global state (Learn events, example package) run serially and reset it afterwards. *(Designer's call.)*
- **Live editing (approach A).** Edits update the local form state immediately; a PATCH is sent debounced (~150 ms for typing) or throttled (~150 ms while dragging, plus a final send on release). **At most one write per package is in flight; edits made meanwhile are merged into the next PATCH**, which is based on the version the previous one returned. (Aborting a fetch does not stop the server write, so "abort and resend" would make a tab conflict with itself.) Previous analysis stays visible with a subtle "updating" indicator until the response arrives. A `409` can therefore only come from another tab or visitor; the client adopts the server document, re-applies its pending edit once (last writer wins per field) and shows a short "updated elsewhere" note. *(Builder check; designer's call.)*
- **Old browser saves.** On first load, if `procurement-scenario-v1` exists in browser storage, it is imported once as a new package via `/packages/import`, the user is told with a toast, and the key is cleared.
- **Import / Export / Reset** in Data controls call the API endpoints above.
- **API unreachable.** A shell-level error state ("Backend unreachable" with retry) instead of view content; the rail, command menu and theme still work.
- **Removed from the web app:** `data/reference.ts`, `data/sources.ts`, `data/roads.ts`, `data/graph-snapshot.json`, `views/*/data.ts` (except purely presentational constants, if any), `lib/model.ts`, `lib/recommend.ts`, `lib/scenario.ts` logic, `lib/use-plan.ts`, `lib/graph/proxy.ts` and `fallback.ts`, `app/api/graph/`. Their unit tests move to the API.

## Graph service changes (`services/graph`)

- New optional `MONGO_URL` (and db name) setting. When set, `load_seed` reads the four graph seed collections with pymongo; when unset, it reads `data/seed/graph/*.json` (tests, local runs without Mongo). Same pydantic validation either way.
- No API change. Its port stays bound to localhost in Compose; only the Node API calls it.

## Running, testing, CI, hosting

- **Compose:** `mongo` (with a named volume and healthcheck), `api` (depends on healthy mongo; graph optional at runtime), `graph` (depends on healthy mongo, since the API seeds it — the graph waits for the seed version to exist, or the API seeds before graph starts; builder's call how), `web` (depends on api). API and graph published on localhost only.
- **API tests:** Vitest + supertest against mongodb-memory-server: model parity, validation and import rules, every endpoint's contract, 409 on stale version, problem+json errors, API key enforcement, seeder idempotence (packages untouched), graph proxy fallback (moved tests).
- **Graph tests:** run against the generated fixture; plus one test that the Mongo loader produces the same seed as the fixture (mongomock or a skipped-if-no-Mongo test; builder's call).
- **Graph derivation tests (API):** each derived node matches its domain document; every `ref` resolves (seeding fails loudly on a dangling reference); the generated fixture is up to date.
- **Example protection:** API rejects every write on the example; Playwright checks that the first edit on the example creates and switches to a copy and the example is unchanged after reload.
- **Playwright:** existing flows keep passing against the full stack, plus: package switcher (create, switch, duplicate, delete), edits persist across reload, two-tab conflict recovery, old browser save imported once, API-down state. Playwright starts Mongo (Docker or mongodb-memory-server), API, graph and web, reusing running ones as today.
- **CI:** add an API job (lint, typecheck, tests); the e2e job brings up `mongo`, `api` and `graph` with Compose.
- **Env:** `MONGO_URL`, `API_KEY` (web↔api), `API_URL` (web, server-only), `GRAPH_SERVICE_URL` and `GRAPH_API_KEY` move from web to api.
- **Hosting (docs only):** MongoDB Atlas free tier; API on Render or Cloud Run alongside the graph service; web stays on Vercel. `docs/architecture.md` and README are rewritten for the three-service layout.

## Left to the builder

- Exact library choices within the stack named above (e.g. which zod→OpenAPI generator), versions, and folder structure inside modules.
- Exact debounce/throttle timings and the "updating" indicator's look, within the anti-goals.
- How Compose orders seeding before the graph service starts.
- Whether `content` is one collection with typed documents per view or one collection per content kind.
- Mongo indexes beyond the obvious (`packages.updatedAt`, unique ids).
