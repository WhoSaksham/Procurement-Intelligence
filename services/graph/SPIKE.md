# Semantica spike (go/no-go)

Date: 2026-11-15 · `semantica==0.7.0` · Python 3.12.16 (uv) · core install only (no torch, spaCy or transformers)

Script: `spike/spike.py` (throwaway). Run with `uv run python spike/spike.py`.

## Result: GO on all three must-haves

| Capability | Result | Semantica call | Glue needed |
|---|---|---|---|
| (a) Graph from structured records | **GO** | `semantica.kg.GraphBuilder(resolve_conflicts=False).build({"entities": [...], "relationships": [...]}, extract=False)` returns `{"entities", "relationships", "metadata"}` | None. `extract=False` skips text extraction, and no LLM is involved |
| (b) Supplier deduplication | **GO** | `semantica.deduplication.DuplicateDetector(similarity_threshold=0.75, confidence_threshold=0.5, use_clustering=True).detect_duplicate_groups(entities)` returns `DuplicateGroup(entities, similarity_scores{(id_a, id_b): score}, representative, confidence)` | **JV names.** Joint-venture names are pulled into the lead firm's group (0.85). We detect JV rows before deduplication (`JV`, `/`, `joint venture`, `consortium`), keep each one as its own entity, and link it to its members with a role. Matches the design. |
| (c) Resolve a new name | GO (with glue) | `semantica.deduplication.calculate_similarity({"name": a}, {"name": b}, method="jaro_winkler")` returns `SimilarityResult(score, method)` | `DuplicateDetector` works on batches, so resolution loops `calculate_similarity` over each cluster's variants and takes the best score. Threshold **0.88**: "Meridian Roadworks Limited" scores 0.97 (match), "Meridian Rdwks (K) Ltd" 0.93 (match), "Zebra Holdings" 0.57 (no match). |
| (d) Provenance | **GO** | `semantica.provenance.ProvenanceManager()` (in-memory) with `.track_entity(id, source=..., source_location=..., source_quote=..., confidence=...)`, `.track_relationship(rel_id, source=..., ...)` and `.get_lineage(id) -> {"entity_id", "lineage_chain": [ProvenanceEntry as dict]}` | Pass `source_location`, `source_quote` and `confidence` as keyword arguments. Putting them inside `metadata` leaves them unset. |
| (e) Analytics | GO | `semantica.kg.CentralityCalculator().calculate_degree_centrality(kg)` returns `{"centrality": [(id, score)], "rankings": [{"node", "score"}]}`; `semantica.kg.CommunityDetector().detect_communities(kg, method="louvain")` returns `{"communities", "node_assignments": {id: int}, "modularity"}` | Louvain is seeded by networkx and may vary between runs; tests only assert that every node is assigned |
| (f) Neighbourhood | GO (glue) | Uses the graph dict from (a) | Plain breadth-first search over `relationships` (about 10 lines) |

## Notes

- `GraphBuilder.build` takes well under 1 ms for the seed size. The whole startup build is dominated by import time (about 2–3 s).
- Semantica logs warnings at import time. The service lowers Semantica's logger to ERROR.
- Glue lives only in `app/engine.py`, which is the only module that imports `semantica`.
