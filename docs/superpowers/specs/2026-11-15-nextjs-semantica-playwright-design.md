# Procurement Intelligence: Next.js, design system, Semantica graph service, Playwright

Date: 2026-11-15
Status: approved 2026-11-15 (architecture-first order)

## Intent

The app is shown to interviewers as evidence of **production-grade architecture**, not just a demo. Today it is a client-only React/Vite app with one 1,080-line hand-written stylesheet, an illustrative knowledge graph hard-coded in `src/views/Graph.jsx`, and no tests. The rebuild should make the architecture itself the thing worth showing: clear service boundaries, a typed contract between app and service, a real design system, a real graph engine, and automated end-to-end tests that prove it works.

Every analyst-facing behaviour that exists today must survive the move (see "Behaviour to preserve").

## Goals

1. Rebuild the frontend in **Next.js (App Router) with TypeScript**.
2. Replace `src/styles.css` with **Tailwind CSS and shadcn/ui**, driven by a documented token set (colour, type, spacing, radius), in light and dark themes.
3. Add a **Python graph service** built on **Semantica** (MIT, `pip install semantica`) that builds the procurement knowledge graph, resolves supplier name variants, records provenance, and answers graph queries. The Next.js app consumes it live.
4. **Playwright** end-to-end tests covering the analyst flows and the app/service integration, running locally and in CI.
5. One command (`docker compose up`) runs the whole stack; the repo explains the architecture and hosting.

## Non-goals

- No LLM at runtime. "Ask the evidence" keeps its prewritten, keyword-matched answers and grounding display. (Semantica needs no LLM for the parts used here.)
- No change to the forecasting maths in `src/lib/model.js` or the rules in `src/lib/recommend.js`. They are ported to TypeScript, not redesigned.
- No user accounts or server-side persistence of scenarios. Scenarios stay in browser storage with JSON import/export.
- No external graph database (Neo4j etc.). The graph is built in memory at service start.
- Charts are not rewritten in a chart library. The 14 hand-drawn SVG charts are ported and restyled with tokens.

## Anti-goals (would make this a failure even if it works)

- The app breaks or goes blank when the graph service is down. It must fall back to a snapshot and say so.
- The UI looks like a stock shadcn template. It must keep its own identity: Public Sans / Source Serif 4, the paper-and-ink palette, and the three evidence-layer colours.
- Semantica is installed but decorative. At least the graph build, supplier resolution and provenance shown in the UI must genuinely come from Semantica calls.
- Flaky tests. The Playwright suite must pass repeatedly without depending on third-party tile servers.
- Losing the "least clicks" qualities: ⌘K palette, number-key navigation, inline editing in the package bar.

## Constraints

- Local Python is 3.14; Semantica requires `>=3.11.5,<3.14`. The service uses **Python 3.12**, managed with **uv** (installs its own interpreter) and run in Docker. Docker 29 is available locally.
- Node 26 / npm 11 locally. Use npm (the repo has a `package-lock.json`; delete the stray `yarn.lock`).
- MapLibre GL needs the browser: load the map with `next/dynamic` and `ssr: false`. Keep `maplibre-gl@6.15.0` pinned and its worker setup.
- Sentinel-2 cloudless 2018+ imagery is CC BY-NC-SA (non-commercial). Keep the attribution and the README note.
- Pin exact versions for Semantica and for the Next.js/React/Tailwind/shadcn toolchain (latest stable at build time).
- Git: never commit without the user's explicit approval for that commit; no co-author trailers.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Next.js app plus a separate FastAPI service wrapping Semantica, in one repo, run together with Docker Compose. App calls the service through its own API routes; falls back to a generated snapshot. | Two runtimes to maintain, but that is the architecture a real product would have and the point of the exercise. |
| B | Semantica only at build time: a Python script writes graph JSON that Next.js reads. | Simplest hosting, but reads as a build step, not a system. Weaker for the interview purpose. |
| C | Stock `semantica-server` plus Neo4j in Docker. | Most "heavyweight", but three containers for an interviewer to run and little of the code is ours to explain. |

The user chose A.

## Architecture

```
browser ──► Next.js (apps/web)
              ├─ pages: server components shell + client components for interactive views
              ├─ /api/graph/*  route handlers ──HTTP + API key──► graph service (services/graph)
              │                    └─ on timeout/error: serve snapshot JSON, flag source="snapshot"
              └─ browser storage: scenario (package, criteria, custom countries/contracts, sign-off)

graph service (FastAPI, Python 3.12)
  ├─ seed records (JSON)  ──► Semantica graph build (in memory)
  ├─ Semantica deduplication  ──► canonical suppliers + merge history
  ├─ Semantica provenance (SQLite file or in-memory)  ──► lineage per node/edge
  └─ Semantica analytics  ──► centrality, neighbourhoods, paths
```

The browser never calls the service directly. Only Next.js route handlers do, which keeps the service private, lets it require an API key, and gives one place for the fallback.

### Repo layout

```
apps/web/                 Next.js app (TypeScript)
  app/                    routes: / (redirects to /package), /package, /map, /learn, /ask, /graph, /pipeline
  app/api/graph/...       route handlers proxying to the service
  components/ui/          shadcn/ui components (generated, then themed)
  components/             app components (PackageBar, CommandPalette, Evidence, charts, MapCanvas, ...)
  lib/                    model.ts, recommend.ts, geo.ts, elevation.ts, graph-client.ts, store.ts
  data/                   reference.ts, sources.ts, roads.ts, graph-snapshot.json (generated)
  e2e/                    Playwright tests
services/graph/
  app/main.py             FastAPI app and routes
  app/engine.py           the only module that imports semantica (adapter)
  app/models.py           pydantic response models (source of the OpenAPI contract)
  data/seed/*.json        projects, contracts, suppliers (raw name variants), documents, passages, countries
  tests/                  pytest
  Dockerfile, pyproject.toml, uv.lock
docker-compose.yml        web + graph
.github/workflows/ci.yml
README.md, docs/architecture.md
```

The existing `src/`, `index.html`, `vite.config.js` are removed once ported (history stays in git).

## Frontend

### Routing and state

- Each current view becomes a route, so views are linkable and the browser back button works. Number keys 1–6 and ⌘K still navigate (via the router).
- `App.jsx` state moves into a client-side store. **My call: Zustand with its persist middleware**, keeping the existing storage key `procurement-scenario-v1` and JSON import/export format so saved scenarios keep working.
- The package bar, rail, command palette and evidence drawer live in the root layout so they persist across routes.
- The custom-country registry in `model.js` (module-level `setCustomCountries`) becomes an explicit argument or store selector, so model functions stay pure.

### Design system

- Tokens defined as CSS variables in `app/globals.css` and mapped into Tailwind's theme (`@theme`), covering:
  - surface/ink scale (paper, surface, sunk, ink, ink-2, muted, rule, rule-strong);
  - evidence layers (ledger, procedure, retrospective) with tints and on-dark variants;
  - status (worse, better, watch, good) with tints;
  - type (Public Sans for UI, Source Serif 4 for headings), radius, rail and drawer widths.
- shadcn/ui's own variables (`--background`, `--primary`, ...) are set from these tokens, so stock components inherit the app's look.
- Light and dark themes. **My call:** dark is added because tokens make it cheap, and it shows the system is real; the map keeps satellite imagery in both.
- `docs/design-system.md` (short) lists tokens, when to use each, and component conventions. A `/design-system` route is left to the builder's discretion (nice-to-have).

### Component mapping

| Today | shadcn/ui |
|---|---|
| Tabs (custom ARIA) | Tabs |
| Collapse | Collapsible |
| Package bar popovers (`usePopover`) | Popover |
| Country/category/method selects | Select (country list keeps "Add a country…") |
| Command palette | Command (cmdk) in Dialog |
| Evidence drawer | Sheet |
| Toast notices | Sonner |
| Buttons, inputs, forms | Button, Input, Label, Form patterns |
| Status chips, "Your data" tag | Badge |
| Tables (Learn, Pipeline, Graph schema) | Table |
| Hover help on chips/charts | Tooltip |
| Cards/panels | Card |

Charts keep their SVG code; colours and type come from tokens (CSS variables), so they theme automatically.

### Graph view, now live

- Fetches `/api/graph/...` and renders nodes and edges from the service rather than the hard-coded `NODES`/`EDGES`. The current hand-placed layout coordinates move into the seed data as layout hints, so the picture stays readable; a computed layout is left to the builder if hints are missing.
- Selecting a node shows its attributes, links (relation, how matched, confidence) and **provenance lineage** from the service.
- **Supplier name resolution** tab shows the clusters Semantica produced, with similarity scores and the merge decision. It also has an input where the analyst types supplier names and sees how they resolve against known suppliers (live call). This continues the earlier "bring your own data" direction.
- A small badge shows **"Live · Semantica"** or **"Snapshot"** depending on the source of the data.
- The Data pipeline view shows the graph service's health and build stats (node/edge counts, merges, build time) from `/health`.

## Graph service

- FastAPI on Python 3.12, uv-managed, pinned `semantica` version.
- `engine.py` is the only module importing Semantica, so API drift is contained to one file. The builder verifies exact class and method names against the installed version before wiring. Research so far (not yet verified in code): `semantica.kg.GraphBuilder` / `semantica.context.ContextGraph` for building from structured entities and relationships; `semantica.deduplication.DuplicateDetector` and `EntityMerger` for resolution; `semantica.provenance.ProvenanceManager` for lineage; `semantica.kg.CentralityCalculator`, `PathFinder` and neighbour queries for analytics. Core install has no torch/spacy/transformers.
- At startup: load seed JSON → build graph → run supplier deduplication over raw award-row names → record provenance for every node and edge (source document/record, location, confidence) → compute centrality. Build once, keep in memory.
- Seed data is derived from what the app already shows (Graph.jsx nodes/edges/aliases, reference.ts portfolio, sources.ts passages), expanded with enough supplier name variants (roughly 20–40 raw names across ~8 suppliers) for deduplication to be meaningful.

### API (v1)

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | status, Semantica version, build stats |
| GET | `/v1/graph?focus={id}&hops={n}` | nodes (id, type, label, layer, attrs, layout hint) and edges (source, target, relation, basis, confidence) |
| GET | `/v1/nodes/{id}` | node, neighbours, provenance lineage |
| GET | `/v1/suppliers/clusters` | canonical suppliers with variants, similarity, merge decision |
| POST | `/v1/suppliers/resolve` | for submitted names: best canonical match, score, candidates |
| GET | `/v1/analytics` | centrality ranking, communities |

- Pydantic models define responses; the OpenAPI schema generates the TypeScript types used by `apps/web/lib/graph-client.ts` (**my call: `openapi-typescript`**), so the contract is typed end to end.
- Service requires header `X-API-Key` (env `GRAPH_API_KEY`); Next.js reads `GRAPH_SERVICE_URL` and `GRAPH_API_KEY` server-side only.
- `npm run snapshot` (or a make target) calls the running service and writes `apps/web/data/graph-snapshot.json`, which is committed and used as the fallback.

### Settled during review (builder's calls, marked as such)

- **Semantica spike first, with a go/no-go gate.** The plan starts by installing the pinned Semantica in a uv project and proving the three capabilities on seed data before any UI depends on them. Semantica is pre-1.0 (0.7.0) and fast-moving.
  - If a capability is thinner than expected, write thin glue on top of Semantica's own pieces and say so in `docs/architecture.md`. Example: resolving new names against known clusters with `calculate_similarity` (Jaro-Winkler/Levenshtein) when `DuplicateDetector` only handles batches.
  - Do not add the `embeddings-local` extra (torch). Core install plus string similarity only.
  - If one of the three cannot come from Semantica at all, stop and raise it with the user rather than faking it.
- **Analytics has a home.** Centrality drives node size in the Graph view and a "Most connected" list beside it (top suppliers, projects and documents). Communities colour a toggle "Group by community". Both are in the snapshot and covered by a Playwright check.
- **Graph scope and focus.**
  - The seed forms one connected graph covering the four portfolio contracts, their projects, about 8 suppliers, the documents and passages, and the countries.
  - The default focus is the closest precedent to the working package (contract `C1`, as today) at 2 hops. Clicking a node refocuses on it, and a search box jumps to any node.
  - The focus does not follow package-bar edits: the graph shows precedents, not the draft.
  - Layout is computed deterministically in columns by entity type, like today's hand layout: context, projects, contracts and documents, then suppliers and lessons. It is not hand-placed per node.
  - The snapshot holds the full graph, so refocusing works offline.
- **Supplier clusters and joint ventures.**
  - A JV is its own entity linked to each member with a role (lead or member), matching the text the UI already shows. It is not merged into the lead firm.
  - Name variants of a single firm merge.
  - Thresholds and seed variants may be tuned, but the UI shows Semantica's actual output, including any imperfect match, with its score. Pytest asserts the expected merges on the seed.

### Fallback

Route handlers call the service with a short timeout (about 2 s). On error or timeout they return the snapshot with `source: "snapshot"`. `POST /suppliers/resolve` has no meaningful snapshot; when the service is down the UI says resolution needs the live service.

## Testing

### Playwright (the user's ask)

- Runs against `next build && next start` plus the graph service. Locally Playwright's `webServer` starts both; in CI the service runs from Docker.
- Projects: desktop Chromium and a phone viewport (390 px). Firefox/WebKit left to the builder.
- External map tiles and elevation tiles are intercepted with `page.route` and served from small fixtures, so tests never depend on EOX, Esri or AWS.
- Accessibility smoke checks with `@axe-core/playwright` on each route (no serious or critical violations).
- Flows covered, at minimum:
  1. Navigation: rail links, number keys, ⌘K palette jump, and deep links to each route.
  2. Package: editing country/value/method updates the P80 and risks; "Use P80"; dragging the comparables plan line; Apply fixes lowers re-tender risk; method "Use" buttons.
  3. Custom data: add a custom country and see the forecast change; add a custom contract and see it ranked with a "Your data" tag; export → reset → import restores the scenario.
  4. Sign-off: sign, then edit, and see "Changed since … signed off".
  5. Evidence: a citation chip opens the drawer at the right passage.
  6. Ask: a known question returns a grounded answer; an injection attempt is refused.
  7. Graph (live): nodes render from the service, selecting a node shows provenance, supplier resolution of typed names returns a match, badge reads "Live · Semantica".
  8. Graph (fallback): with the service blocked, the snapshot renders and the badge reads "Snapshot".
  9. Site map: map canvas mounts, compare toggle, segment selection, close view runs without console errors (tiles stubbed).
  10. No console errors and no horizontal overflow at 390 px on every route.

### Other tests

- pytest for the service: graph builds from seed, known name variants merge to the expected canonical supplier, provenance exists for every edge, API responses match the models, API key enforced.
- **My call:** a few Vitest unit tests for `model.ts` (forecast percentiles, eligibility, best method) so the maths is pinned during the TypeScript port.

### CI

GitHub Actions on push/PR: lint, typecheck and build for web; pytest for the service; Playwright with the service from Docker; upload the Playwright HTML report on failure.

## Hosting

| Part | Recommended | Alternatives |
|---|---|---|
| Next.js app | Vercel | Netlify, Cloudflare, or the same container host as the service |
| Graph service | Google Cloud Run (container, scales to zero, free tier covers demo traffic) | Render (Docker web service; free tier sleeps when idle), Fly.io, Railway, Hugging Face Spaces (Docker, free, public), AWS App Runner |

- Vercel Python functions are not a good fit: Semantica's core deps (pandas, scipy, scikit-learn, pyarrow, grpcio) are large, and the service builds its graph in memory at start, which suits a container better than per-request functions.
- Scale-to-zero hosts have cold starts of several seconds; the snapshot fallback covers the first request, and the badge makes it visible.
- The README documents both "everything in Docker Compose" and "Vercel + Cloud Run". Actual deployment is out of scope unless the user asks.

## Behaviour to preserve

Package page (summary strip, three stage columns, details tabs, sign-off), package bar inline editing and "More" popover, custom countries/contracts, import/export/reset, ⌘K palette with "Ask the evidence" fallthrough, number-key navigation, citation chips and drawer, Site map (2019/2024, compare swipe, high-res, 3D terrain, elevation profile, close view, drive, km posts), Learn, Ask (grounding check, injection guard), Pipeline tabs, 390 px layout with no horizontal overflow.

## Build order (user's decision: architecture first)

1. Next.js + TypeScript + Tailwind/shadcn skeleton with the token set, root layout (rail, package bar, palette shell) and routes.
2. Semantica spike and go/no-go gate, then the graph service, seed data, pytest, Dockerfile, compose.
3. Typed client, API route handlers with snapshot fallback, live Graph view (including analytics and supplier resolution), Pipeline health.
4. Playwright harness (service + web, tile stubs, axe), the graph live/fallback specs, and CI.
5. Port and restyle the remaining views: Package, package bar and custom data, Ask, Learn, Pipeline, Site map. Add Playwright specs per view as each lands.
6. Remove the Vite app, then update the README and `docs/architecture.md`.

The Vite app keeps working until step 6. If time runs short, step 5 is what gets trimmed.

## Left to the builder

- Exact versions, lint/format config (ESLint + Prettier or Biome), folder naming inside `components/`.
- Whether the root uses npm workspaces or just scripts.
- Computed graph layout if seed layout hints are insufficient.
- A `/design-system` showcase route.
- Additional Playwright browsers.
