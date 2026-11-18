# Architecture

Procurement Intelligence has three services in one repository:

- **`apps/web`**: a Next.js (App Router, TypeScript) app with Tailwind CSS and shadcn/ui. It owns the screens and nothing else. It holds no domain data and computes no forecasts.
- **`services/api`**: a Node.js service (Express 5, Mongoose). It is the system of record (MongoDB) and owns the business logic: forecasting and risk, tender criteria checks, recommendations, saved packages, Ask and Learn. It is the only service the web app talks to.
- **`services/graph`**: a FastAPI service that builds the procurement knowledge graph with [Semantica](https://github.com/semantica-agi/semantica). It handles supplier name resolution, provenance and graph analytics.

```
browser ──► Next.js (apps/web)
              └─ /api/[...path] route ──HTTP + X-API-Key──► API (services/api, Express)
                                                              ├─ MongoDB: reference, evidence, contracts, roads, content,
                                                              │           packages, learn events, graph seed collections
                                                              └─ /v1/graph/* ──HTTP + X-API-Key──► graph service (services/graph)
                                                                    └─ on timeout / 401 / 5xx / unreachable: committed snapshot, source="snapshot"

data/seed/*.json ──(API seeder, versioned, on startup)──► MongoDB
                                                           └─ graphNodes, graphEdges, supplierRegistry, suppliersRaw ──► graph service at startup
```

## Request flow

1. A client component calls `lib/api/client.ts`, for example `patchPackage(id, { version, pkg: { plannedDays: 200 } })`, which fetches `/api/v1/packages/<id>`.
2. The Next route handler (`app/api/[...path]/route.ts`, logic in `lib/api/proxy.ts`) forwards `/api/v1/*` to `${API_URL}/v1/*`:
   - It adds the server-side `X-API-Key` and drops any key the browser sent. The browser never sees the API URL or key.
   - Only `/v1` paths are reachable, and path segments are validated.
   - An unreachable or slow API becomes a `503` problem, which the app shows as **Backend unreachable** (polling every 5 s until it returns).
3. The API validates the request with zod, runs the change against MongoDB, and returns the package with its **analysis**: prediction, curve points, method comparison, criteria check, comparables, recommendations, agent trace and sign-off staleness. Every error is an RFC 9457 `application/problem+json` document with a request id.
4. Graph requests go through the API (`/v1/graph/*`), which forwards them to the graph service and answers from a committed snapshot when the service is down. The UI shows a **Live · Semantica** or **Snapshot** badge.

## Live editing and concurrency

- **Optimistic concurrency:** every package has a `version`. Each write says which version it is based on, and MongoDB applies it only if that is still current (`findOneAndUpdate` on `{_id, version}`), so two writers can never both win. A stale write gets `409` with the current document.
- **One write in flight per package:** the web app's save queue (`lib/api/write-queue.ts`) shows edits immediately, sends them debounced (150 ms; throttled while dragging, flushed on release), keeps at most one request in flight per package, and merges edits made meanwhile into the next request. A `409` can therefore only come from another tab or visitor; the queue re-applies the edit once on top of the newer version and says so.
- **The example package is read-only** (`409 example-read-only`). The first edit on it creates a copy and switches to it.
- Other changes (sign-off, benchmark, countries, contracts, reset) run one at a time, after pending edits are saved.

## API

All `/v1` routes require `X-API-Key`; `/health` (liveness) and `/ready` (MongoDB required, graph service reported) are open. The contract is generated from the zod schemas into `services/api/openapi.json`, and the web app's types (`apps/web/lib/api/schema.d.ts`) are generated from it.

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/reference` | Countries, sectors, categories, methods, evidence layers, defaults, rating scale, ISR history |
| GET | `/v1/sources`, `/v1/sources/{id}` | Evidence catalogue in citation order; one passage |
| GET | `/v1/packages` | Saved packages, the example first |
| POST | `/v1/packages` | Create from defaults or as a copy of `fromId` |
| GET / PATCH / DELETE | `/v1/packages/{id}` | Package plus analysis; change fields and criteria (`version` required); delete |
| POST | `/v1/packages/{id}/benchmark`, `/signoff`, `/reset` | Apply benchmark criteria, sign off by name, restore to the example |
| PUT / DELETE | `/v1/packages/{id}/countries/{countryId}` | Add or override a country for this package; remove it |
| POST / DELETE | `/v1/packages/{id}/contracts[/{contractId}]` | Add your own contract (the API scores it); remove it |
| GET | `/v1/packages/{id}/export`, `/portfolio` | Scenario file download; portfolio plus your contracts by warning |
| POST | `/v1/packages/import` | New package from a scenario file (old exports and browser saves load) |
| GET | `/v1/contracts/{id}/road`, `/v1/content/{view}` | Road alignment for the map; illustrative content for package, pipeline, learn |
| GET / POST | `/v1/ask/questions`, `/v1/ask` | Suggested questions; refuse, match or decline a question, with each claim marked kept or removed |
| GET / POST | `/v1/learn/events`, `/next`, `/reset` | Shared feedback-event feed |
| GET / POST | `/v1/graph/*` | Graph service, with snapshot fallback |

## Seeding and one source of truth

- `data/seed/` at the repository root is the only copy of the seed data. The API seeder (`services/api/src/seed`) loads it when `data/seed/VERSION` differs from the version stored in MongoDB, or on `npm run seed -- --force`. It never touches user packages, and it owns the example package.
- Graph nodes that describe domain records (the country, the portfolio contracts, the evidence passages) are stored in `data/seed/graph/nodes.json` as **references**. The seeder fills their labels, attributes, layer and locator from the domain records (`derive-graph.ts`), so a change to a contract or a country reaches the graph. Hand-written fields no record holds (award-row locators, the procurement method) stay on the reference. A reference to a missing record fails the seed.
- The graph service reads the assembled collections from MongoDB at startup (`MONGO_URL`). Its tests read a generated fixture (`services/graph/tests/fixtures/seed`, from `npm run export:graph-seed`), which CI checks is up to date.

## Graph service API

All `/v1` routes require `X-API-Key`; `/health` is open. CORS is off, because only the API calls the service.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | Status, Semantica version, build stats |
| GET | `/v1/graph?focus=C1&hops=2` | Neighbourhood (hops 1–4): nodes with layout hints, centrality and community; links with relation, basis, confidence, role and source |
| GET | `/v1/full` | Whole graph (used for the snapshot) |
| GET | `/v1/nodes/{id}` | Node, its links, provenance lineage |
| GET | `/v1/suppliers/clusters` | Canonical firms, their award-row name variants with scores, joint-venture roles |
| POST | `/v1/suppliers/resolve` | Best match for each submitted name (1–50 names, 1–200 characters each) |
| GET | `/v1/analytics` | Degree centrality ranking, Louvain communities |

The contract is exported to `services/graph/openapi.json`. Interactive docs are off by default on both backends; set `EXPOSE_DOCS=true` locally to browse them.

## What Semantica does, and what is glue

`services/graph/app/engine.py` is the only module that imports Semantica. The spike that verified each call is recorded in `services/graph/SPIKE.md`.

| Capability | Semantica | Glue in `engine.py` |
|---|---|---|
| Build the graph from structured records | `kg.GraphBuilder(...).build({"entities", "relationships"}, extract=False)` | None |
| Group supplier name variants | `deduplication.DuplicateDetector.detect_duplicate_groups`. Registered names join the batch, so groups inherit canonical ids | Joint-venture rows (`JV`, `/`, "joint venture") are held out and linked to members as lead or member |
| Resolve a new name | `deduplication.calculate_similarity(method="jaro_winkler")` | Best score across each cluster's variants; a match needs 0.88 or above |
| Provenance | `provenance.ProvenanceManager.track_entity` / `track_relationship` / `get_lineage` | None |
| Analytics | `kg.CentralityCalculator.calculate_degree_centrality`, `kg.CommunityDetector.detect_communities(method="louvain")` | Scores normalised to the most connected node |
| Neighbourhood | None | Breadth-first search over the built relationships |

The core install needs no LLM, no external database and no torch/spaCy/transformers. The graph is rebuilt in memory at startup in about 10 ms, after a few seconds of imports, from the graph collections in MongoDB.

## Code layout

| Path | Responsibility |
|---|---|
| `services/api/src/modules/<domain>/` | One folder per domain (`reference`, `sources`, `contracts`, `content`, `ask`, `learn`, `packages`, `analysis`, `graph`): Mongoose model, zod schemas, service, routes |
| `services/api/src/modules/analysis/` | The forecasting and risk model, recommendation rules and the `analyse()` that builds a package's analysis (pure functions) |
| `services/api/src/seed/` | Seed loader, graph derivation, versioned seeder, fixture exporter |
| `services/api/src/http/`, `src/openapi/` | Request ids, API key, problem responses, validation; route registry and OpenAPI export |
| `apps/web/app/` | Routes, the root layout, the `/api/[...path]` pass-through route, global styles and tokens |
| `apps/web/lib/api/` | Typed client, query hooks, the save queue, the current-package provider, legacy browser-save import |
| `apps/web/components/`, `apps/web/views/` | UI: shadcn/ui primitives, shell (package bar and switcher, command menu, backend state), charts, graph, map, and view bodies |

The design system (tokens, light and dark themes, usage rules) is documented in [design-system.md](design-system.md).

## Testing

| Layer | Tool | What it proves |
|---|---|---|
| API | Vitest + supertest on mongodb-memory-server (`services/api/test`) | The moved model reproduces the original outputs exactly; every endpoint's contract; validation and import sanitising; version conflicts, including concurrent writers; the example is read-only; seeding is idempotent and never touches user packages; graph derivation and dangling references; graph proxy fallback; the OpenAPI document and graph fixture are current |
| Graph service | pytest (`services/graph/tests`) | Graph build, expected supplier merges, joint ventures kept separate, provenance on every node and link, API contract, key enforcement, input validation, the Mongo seed loader |
| Web units | Vitest (`apps/web/lib/**/*.test.ts`) | The API pass-through route, the save queue (coalescing, one request in flight, edits bound to their package, one copy of the example per burst, conflict re-apply), legacy browser-save import, graph layout, geometry |
| Hydration | Playwright against `next dev` | Every route loads without React hydration-mismatch reports |
| End to end | Playwright (`apps/web/e2e`) | Every analyst flow on desktop and a 390 px phone viewport against MongoDB, the API and the graph service: packages persist, the switcher, copying the example, two-tab conflicts, legacy import, backend down and recovery, live and snapshot graph, axe accessibility, no console errors, no horizontal overflow |

## Hosting

| Part | Recommended | Alternatives |
|---|---|---|
| Web app | Vercel | Netlify, Cloudflare, or a container (`apps/web/Dockerfile`) |
| API | Google Cloud Run or Render (container, `services/api/Dockerfile`, built from the repo root) | Fly.io, Railway, AWS App Runner |
| Graph service | Next to the API: Cloud Run or Render | Fly.io, Railway, Hugging Face Spaces |
| MongoDB | MongoDB Atlas (free tier covers demo traffic) | Any MongoDB 8 |

- Start order matters only on first deploy: the API seeds MongoDB, then the graph service reads it. On scale-to-zero hosts the first request after idling takes a few seconds; the snapshot covers the graph service, and the app's "Backend unreachable" state covers the API.
- Set long random `API_KEY` (web ↔ API) and `GRAPH_API_KEY` (API ↔ graph) values; point `API_URL` and `GRAPH_SERVICE_URL` at the services and `MONGO_URL` at the database.
- Sentinel-2 cloudless 2018+ mosaics are CC BY-NC-SA (non-commercial). A commercial deployment needs an EOX licence or self-processed Copernicus data.
