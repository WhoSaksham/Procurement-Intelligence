# Procurement Intelligence (demo)

React demo of an AI-powered procurement intelligence platform built on World Bank open-data sources. One working package moves through the procurement lifecycle. Every recommendation links to the record or document passage that supports it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## Getting around quickly

- **⌘K / Ctrl+K** (or `/`) opens the command menu: jump to any view or contract, run actions (use the P80 estimate, apply benchmark criteria, switch method, show a contract on the map), or ask a question.
- **1–8** switch views when you aren't typing in a field.
- Package fields in the top bar can be edited in place from any view, and results update live.

## Where each module from the brief lives

| Brief | In the app |
| --- | --- |
| Module 1: ingestion, knowledge graph, chunking | **Data pipeline**: feeds, processing stages, structure-aware ICR chunking, chunk metadata, handling of missing data. **Knowledge graph**: entity/key schema, exact vs scored links, supplier name resolution |
| Module 2: predictive and prescriptive engines | **Plan**: survival-model time to signature (P50/P80, chance of meeting the plan), re-tender / amendment / slippage risk with drivers, method counterfactuals, recommended actions, agent retrieval trace. **Tender design**: criteria and specification checks that feed back into re-tender risk |
| Module 3: guardrails and attribution | Citation chips coloured by evidence layer, which open the exact source passage. **Ask the evidence**: claim-level grounding check that removes unsupported sentences. **Execution**: weighting of conflicting ISR vs ICR evidence |
| Module 4: continuous learning and rollout | **Learn**: feedback events and what each one updated, model/index health with retrain triggers, phased pilot, KPIs |
| Geospatial monitoring | **Site map**: road contracts on Sentinel-2 imagery, chainage segments by reported status, reported vs satellite-observed progress, 2019 vs 2024 swipe comparison, 3D terrain, high-resolution basemap |

## Site map data

| Layer | Source | Notes |
| --- | --- | --- |
| Satellite imagery | [Sentinel-2 cloudless](https://s2maps.eu) annual mosaics by EOX IT Services GmbH (2018–2024 available) | 10 m resolution. The 2018+ mosaics are licensed CC BY-NC-SA 4.0: fine for a demo, but commercial use needs an EOX licence or self-processed Copernicus data |
| High-resolution basemap | Esri World Imagery | Subject to Esri's terms of use |
| Terrain (3D) | AWS Terrain Tiles (Terrarium encoding) | No key needed |
| Road alignments | OpenStreetMap, routed via OSRM (`src/data/roads.js`) | ODbL. Status per chainage segment and change values are illustrative |

A production version would compute change per segment from individual Sentinel-2 L2A scenes (for example through Microsoft Planetary Computer or Copernicus Data Space STAC), rather than relying on annual mosaics.

## Notes

- All data except the imagery and road geometry is illustrative. Records follow the shapes of World Bank Contract Awards, Projects, Finances, Documents & Reports, CPIA and WGI data, but the project IDs, firms, passages and figures are synthetic.
- The models in `src/lib/model.js` are linearised stand-ins (a Weibull time-to-award model and logistic risk scores) that run in the browser. They respond to every input, but they were not fitted to real data.
- The evidence corpus lives in `src/data/sources.js`. Replace it with a retrieval API to connect real indexes.
