# Architecture

Procurement Intelligence has two services in one repository:

- **`apps/web`**: a Next.js (App Router, TypeScript) app with Tailwind CSS and shadcn/ui. It owns all screens and the analyst's scenario.
- **`services/graph`**: a FastAPI service that builds the procurement knowledge graph with [Semantica](https://github.com/semantica-agi/semantica). It handles supplier name resolution, provenance and graph analytics.

```
browser ──► Next.js (apps/web)
              ├─ pages: server shell + client components for interactive views
              ├─ /api/graph/*  route handler ──HTTP + X-API-Key──► graph service (services/graph)
              │                    └─ on timeout / 401 / 5xx / unreachable: answer from snapshot, source="snapshot"
              └─ browser storage: scenario (package, criteria, custom countries and contracts, sign-off)

graph service (FastAPI, Python 3.12, uv)
  ├─ seed records (data/seed/*.json) ──► Semantica GraphBuilder (in memory)
  ├─ Semantica DuplicateDetector    ──► canonical suppliers; joint ventures kept separate
  ├─ Semantica ProvenanceManager    ──► W3C PROV-O lineage per node and link
  └─ Semantica CentralityCalculator / CommunityDetector ──► "most connected", communities
```

## Request flow

1. A client component calls `lib/graph/client.ts`, for example `getGraph('C1', 2)`, which fetches `/api/graph/graph?focus=C1&hops=2`.
2. The route handler (`app/api/graph/[...path]/route.ts`, logic in `lib/graph/proxy.ts`) forwards to `${GRAPH_SERVICE_URL}/v1/graph?…` with the `X-API-Key` header and a 2-second timeout.
   - The browser never sees the service URL or the key.
   - Path segments are validated, so the proxy cannot reach other service routes.
3. Responses come back in an envelope: `{ source: 'live', data }`.
   - 404 and 422 from the service are passed through as `{ source: 'live', error }`.
   - Anything else is answered from the committed snapshot as `{ source: 'snapshot', … }`. That covers an unreachable service, a timeout, a 401 or a 5xx.
4. The UI shows a **Live · Semantica** or **Snapshot** badge. Supplier resolution needs the live service; offline, the app says so instead of failing.

The snapshot (`apps/web/data/graph-snapshot.json`) and the TypeScript API types (`apps/web/lib/graph/schema.d.ts`) are generated together by `npm run snapshot` from a running service. The service's pydantic models are therefore the single source of the contract.

## Graph service API

All `/v1` routes require `X-API-Key`; `/health` is open. CORS is off, because only the web server calls the service.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | Status, Semantica version, build stats |
| GET | `/v1/graph?focus=C1&hops=2` | Neighbourhood (hops 1–4): nodes with layout hints, centrality and community; links with relation, basis, confidence, role and source |
| GET | `/v1/full` | Whole graph (used for the snapshot) |
| GET | `/v1/nodes/{id}` | Node, its links, provenance lineage |
| GET | `/v1/suppliers/clusters` | Canonical firms, their award-row name variants with scores, joint-venture roles |
| POST | `/v1/suppliers/resolve` | Best match for each submitted name (1–50 names, 1–200 characters each) |
| GET | `/v1/analytics` | Degree centrality ranking, Louvain communities |

The contract is exported to `services/graph/openapi.json`. Interactive docs (`/docs`, `/redoc`, `/openapi.json`) are off by default so a public deployment doesn't publish its API map; set `EXPOSE_DOCS=true` locally to browse them.

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

The core install needs no LLM, no external database and no torch/spaCy/transformers. The graph is rebuilt in memory at startup in about 10 ms, after a few seconds of imports.

## Web app structure

| Path | Responsibility |
|---|---|
| `app/` | Routes (`/package`, `/map`, `/learn`, `/ask`, `/graph`, `/pipeline`), the root layout (rail, package bar, command menu, evidence sheet), the graph API route, and global styles and tokens |
| `components/ui/` | shadcn/ui primitives (including the Recharts `chart` wrapper), themed by tokens |
| `components/shell/`, `components/evidence/`, `components/map/` | App components |
| `components/charts/` | Statistical charts on Recharts (duration curve, method ranges, benchmark bullets, comparables beeswarm with a native range slider, milestones, progress, disbursement band, ratings, elevation profile) |
| `components/graph/` | Knowledge graph on React Flow (custom entity nodes, pan/zoom/drag, keyboard selection) plus node panel, supplier resolution and service health |
| `views/<name>/` | View bodies and their illustrative content |
| `lib/model.ts`, `lib/recommend.ts` | Forecasting and risk model, and the recommendation rules (pure functions) |
| `lib/scenario.ts`, `lib/store.ts` | Scenario shape, import/export, persistence (Zustand; same storage key and JSON as the original app) |
| `lib/graph/` | Typed client, proxy, snapshot fallback, layout |

The design system (tokens, light and dark themes, usage rules) is documented in [design-system.md](design-system.md).

## Testing

| Layer | Tool | What it proves |
|---|---|---|
| Domain logic | Vitest (`apps/web/lib/**/*.test.ts`) | The TypeScript model reproduces the original JavaScript outputs; scenario import, export and hydration (including old saves and malformed files); proxy fallback on 401, 5xx, timeout and network errors; graph layout |
| Graph service | pytest (`services/graph/tests`) | Graph build, expected supplier merges, joint ventures kept separate, provenance on every node and link, API contract, key enforcement, input validation |
| Hydration | Playwright against `next dev` (`npm run test:e2e:dev`) | Every route loads with a saved scenario without React hydration-mismatch reports (only development builds emit them) |
| End to end | Playwright (`apps/web/e2e`) | Every analyst flow on desktop and a 390 px phone viewport, against the real graph service. Covers live and fallback graph modes, axe accessibility (no serious or critical violations), no console errors or hydration warnings, no horizontal overflow. Map, terrain and elevation tiles are stubbed locally, so tests never depend on third-party servers |

CI (`.github/workflows/ci.yml`) runs web lint, typecheck, unit tests and build; service tests; and Playwright against the service started by Docker Compose. It uploads the Playwright report on failure.

## Hosting

| Part | Recommended | Alternatives |
|---|---|---|
| Web app | Vercel | Netlify, Cloudflare, or the same container host as the service (`apps/web/Dockerfile`, Next standalone output) |
| Graph service | Google Cloud Run: container, scales to zero, free tier covers demo traffic | Render (Docker web service; free tier sleeps when idle), Fly.io, Railway, Hugging Face Spaces (Docker, free, public), AWS App Runner |

- Vercel's Python functions are a poor fit. Semantica's core dependencies (pandas, scipy, scikit-learn, pyarrow, grpcio) are large, and the graph is built in memory at startup, which suits a long-running container.
- On scale-to-zero hosts the first request after idling takes a few seconds. The snapshot fallback covers it, and the badge makes it visible.
- Set the same long random `GRAPH_API_KEY` on both services, and point `GRAPH_SERVICE_URL` at the service.
- Sentinel-2 cloudless 2018+ mosaics are CC BY-NC-SA (non-commercial). A commercial deployment needs an EOX licence or self-processed Copernicus data.
