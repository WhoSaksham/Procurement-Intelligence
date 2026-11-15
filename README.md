# Procurement Intelligence

A procurement intelligence platform on World Bank open-data sources. One working package moves through the procurement lifecycle, and every recommendation links to the record or document passage that supports it. The knowledge graph behind it is built live by a Python service using [Semantica](https://github.com/semantica-agi/semantica).

- **`apps/web`**: Next.js 16 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui, Recharts (via shadcn charts), React Flow for the knowledge graph, MapLibre.
- **`services/graph`**: FastAPI and Semantica. Builds the graph, resolves supplier names, records provenance, computes graph analytics.
- **Docs**: [architecture](docs/architecture.md), [design system](docs/design-system.md), [design spec](docs/superpowers/specs/2026-11-15-nextjs-semantica-playwright-design.md).

## Quick start

```bash
docker compose up --build        # web on http://localhost:3000, graph service on :8000
```

### Without Docker

Prerequisites: Node 24+, [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for the service).

```bash
# graph service
cd services/graph && uv sync && GRAPH_API_KEY=dev-key uv run uvicorn app.main:app --reload --port 8000

# web app (another terminal)
cd apps/web && npm install && npm run dev       # http://localhost:3000
```

If the graph service is not running, the web app serves a saved snapshot of the graph and shows a **Snapshot** badge instead of **Live · Semantica**.

### Environment

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `GRAPH_API_KEY` | both | `dev-key` | Shared secret sent as `X-API-Key`. Use a long random value outside local dev |
| `GRAPH_SERVICE_URL` | web (server only) | `http://localhost:8000` | Where the web app's API route reaches the service |
| `EXPOSE_DOCS` | graph service | `false` | Serve the interactive API docs at `/docs`. Keep it off on public deployments |

## Tests

```bash
cd apps/web && npm test                 # Vitest: model, scenario store, graph proxy and fallback, layout
cd services/graph && uv run pytest      # graph build, supplier merges, provenance, API contract
cd apps/web && npm run test:e2e         # Playwright, desktop + 390 px phone, against the real service
cd apps/web && npm run test:e2e:dev     # hydration check against `next dev` (reuses a running dev server)
```

Playwright starts the graph service with uv and the web app with `next build && next start`. If a service is already running on :8000 (for example from Docker Compose), it reuses it. Map tiles, terrain and elevation are served from local stubs. Every page is also checked for accessibility (axe, in both themes), console errors and horizontal overflow. React only reports hydration mismatches in development builds, so `test:e2e:dev` loads every route under `next dev` with a saved scenario and fails on any of them. CI runs all three suites on every push and pull request.

After changing the service's response models or seed data, run `npm run snapshot` from the repo root with the service running. It regenerates the web app's offline snapshot and its TypeScript API types.

## Getting around quickly

- **Package** puts plan, tender design and execution on one page: a summary strip, three stage columns, and tabbed details. The details cover market approach, signature curve, risk drivers, progress, milestones, disbursement vs peers, who wins, evidence conflict and precedents.
- **⌘K / Ctrl+K** (or `/`) opens the command menu: jump to a view, a package section or a contract, run an action, or ask a question.
- **1–6** switch views when you aren't typing in a field.
- Package fields in the top bar can be edited in place from any view, and results update live. Drag the plan line on the comparables strip to change the planned duration.
- **Sign off** a brief by name; any later change marks it as changed since sign-off.
- **Knowledge graph**:
  - Explore the live graph (pan, zoom, drag nodes) and centre it on any node.
  - See each node's provenance and the most connected entities.
  - Group nodes by community.
  - Resolve your own supplier names against known firms.
- **Theme:** dark by default; switch to light from the rail.

## Bringing your own data

- **Countries:** choose *Add a country…* in the Country menu, or edit any country's CPIA, WGI regulatory quality and fragility under **More**. The forecasts use these scores immediately.
- **Sectors:** type any sector under **More**.
- **Contracts:** *Add your own contract* in the Execution column. The warning score and signals are computed from progress and payment days, and tagged as your data.
- **Supplier names:** paste award-row names under Knowledge graph → Supplier name resolution.
- **Scenarios:** everything is kept in this browser between visits. **Export** saves a JSON file; **Import** loads one; **Reset** returns to the example. Files exported by the earlier version of the app still load.

## Where each module from the brief lives

| Brief | In the app |
| --- | --- |
| Module 1: ingestion, knowledge graph, chunking | **Data pipeline**: live graph service health, feeds with their World Bank API endpoints, processing stages, structure-aware ICR chunking, missing-data handling. **Knowledge graph**: built by Semantica, with exact vs scored links, provenance per node, supplier deduplication with joint ventures kept separate |
| Module 2: predictive and prescriptive engines | **Plan**: survival-model time to signature (P50/P80, chance of meeting the plan), re-tender / amendment / slippage risk with drivers, method counterfactuals, recommended actions, agent retrieval trace. **Tender design**: criteria and specification checks that feed back into re-tender risk |
| Module 3: guardrails and attribution | Citation chips coloured by evidence layer, which open the exact source passage. **Ask the evidence**: claim-level grounding check that removes unsupported sentences, plus a guard against instructions to the assistant. **Execution**: weighting of conflicting ISR vs ICR evidence |
| Module 4: continuous learning and rollout | **Learn**: feedback events and what each one updated, model/index health with retrain triggers, phased pilot, KPIs |
| Geospatial monitoring | **Site map**: road contracts on Sentinel-2 imagery, chainage segments and km posts, reported vs satellite-observed progress, 2019 vs 2024 swipe comparison, 3D terrain, high-resolution close view of any kilometre, a drive along the alignment, and a real elevation profile with grades |

## Site map data

| Layer | Source | Notes |
| --- | --- | --- |
| Satellite imagery | [Sentinel-2 cloudless](https://s2maps.eu) annual mosaics by EOX IT Services GmbH (2018–2024 available) | 10 m resolution. The 2018+ mosaics are licensed CC BY-NC-SA 4.0: fine for a demo, but commercial use needs an EOX licence or self-processed Copernicus data |
| High-resolution basemap | Esri World Imagery | Subject to Esri's terms of use |
| Terrain (3D) and elevation profile | AWS Terrain Tiles (Terrarium encoding) | No key needed. The profile samples real elevation every 250 m along the alignment |
| Road alignments | OpenStreetMap, routed via OSRM (`apps/web/data/roads.ts`) | ODbL. Status per chainage segment and change values are illustrative |

A production version would compute change per segment from individual Sentinel-2 L2A scenes (for example through Microsoft Planetary Computer or Copernicus Data Space STAC), rather than relying on annual mosaics.

## Notes

- **What's real:** the imagery, road geometry, elevation and Semantica's graph processing.
- **What's illustrative:** all other data. Records follow the shapes of World Bank Contract Awards, Projects, Finances, Documents & Reports, CPIA and WGI data, but the project IDs, firms, passages and figures are synthetic, including the graph service's seed data in `services/graph/data/seed`.
- **The models** in `apps/web/lib/model.ts` are linearised stand-ins (a Weibull time-to-award model and logistic risk scores) that run in the browser. They respond to every input, but they were not fitted to real data.
- **Ask the evidence** uses prepared answers and grounding scores to demonstrate the behaviour; no language model is called at runtime.
- **The evidence corpus** lives in `apps/web/data/sources.ts`. Replace it with a retrieval API to connect real indexes.
