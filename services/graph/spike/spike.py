"""Throwaway spike: prove Semantica can do what the graph service needs.

(a) build a graph from structured entities and relationships, no LLM
(b) find duplicate supplier names with scores
(c) resolve a new name against known suppliers
(d) record provenance and read back lineage
(e) centrality and communities
(f) 2-hop neighbours
"""

import logging
import time
import warnings

warnings.filterwarnings("ignore")
logging.disable(logging.WARNING)

from semantica.deduplication import DuplicateDetector, calculate_similarity  # noqa: E402
from semantica.kg import CentralityCalculator, CommunityDetector, GraphBuilder  # noqa: E402
from semantica.provenance import ProvenanceManager  # noqa: E402

ENTITIES = [
    {"id": "KE", "name": "Kenya", "type": "Country"},
    {"id": "P171204", "name": "P171204 Rural Access", "type": "Project"},
    {"id": "C1", "name": "RW-ICB-03 Lot 2", "type": "Contract"},
    {"id": "S1", "name": "Meridian Roadworks Ltd", "type": "Supplier"},
    {"id": "ICR", "name": "Completion report", "type": "Document"},
    {"id": "L1", "name": "Lesson: size criteria per lot", "type": "Lesson"},
]
RELATIONSHIPS = [
    {"source": "P171204", "target": "KE", "type": "located_in", "confidence": 1.0},
    {"source": "C1", "target": "P171204", "type": "financed_by", "confidence": 1.0},
    {"source": "C1", "target": "S1", "type": "awarded_to", "confidence": 0.94},
    {"source": "ICR", "target": "P171204", "type": "evaluates", "confidence": 1.0},
    {"source": "L1", "target": "ICR", "type": "part_of", "confidence": 1.0},
    {"source": "L1", "target": "C1", "type": "explains", "confidence": 0.84},
]
NAMES = [
    "Meridian Roadworks Ltd",
    "MERIDIAN ROAD WORKS LIMITED",
    "Meridian Rdwks (K) Ltd",
    "Tana Civil Contractors",
    "Tana Civil Contractors Ltd",
    "TANA CIVIL CONTRACTORS LIMITED",
    "Meridian Roadworks Ltd / Tana Civil JV",
    "Kestrel Engineering Associates",
]


def section(t):
    print(f"\n=== {t}")


section("(a) graph build")
t0 = time.perf_counter()
kg = GraphBuilder(resolve_conflicts=False).build({"entities": ENTITIES, "relationships": RELATIONSHIPS}, extract=False)
print("keys:", list(kg.keys()))
print("entities:", len(kg["entities"]), "relationships:", len(kg["relationships"]), f"{(time.perf_counter() - t0) * 1000:.0f} ms")
print("sample entity:", kg["entities"][0])
print("sample rel:", kg["relationships"][0])

section("(b) duplicate groups")
ents = [{"id": f"N{i}", "name": n, "type": "Supplier"} for i, n in enumerate(NAMES)]
det = DuplicateDetector(similarity_threshold=0.75, confidence_threshold=0.5, use_clustering=True)
groups = det.detect_duplicate_groups(ents)
for g in groups:
    print(f"group conf={g.confidence:.2f} rep={g.representative.get('name')!r}:", [e["name"] for e in g.entities])
    print("   scores:", {k: round(v, 3) for k, v in list(g.similarity_scores.items())[:6]})

section("(c) resolve new name")
for new in ["Meridian Roadworks Limited", "Zebra Holdings"]:
    best = max(
        ((calculate_similarity({"name": new}, {"name": n}, method="jaro_winkler"), n) for n in NAMES),
        key=lambda r: r[0].score,
    )
    print(new, "->", best[1], round(best[0].score, 3))
    print("   result fields:", best[0])

section("(d) provenance")
prov = ProvenanceManager()
e = prov.track_entity("S1", source="award-row-2021-0417", metadata={"confidence": 0.97, "source_location": "Major Contract Awards, row 0417"})
print("entry:", e)
r = prov.track_relationship("C1-awarded_to-S1", source="ca2", metadata={"confidence": 0.94, "source_entity_id": "C1", "target_entity_id": "S1"})
print("rel entry:", r)
print("lineage S1:", prov.get_lineage("S1"))
print("provenance S1:", prov.get_provenance("S1"))

section("(e) analytics")
cent = CentralityCalculator().calculate_degree_centrality(kg)
print("degree:", cent if not isinstance(cent, dict) else {k: (v if not isinstance(v, dict) else list(v.items())[:6]) for k, v in cent.items()})
comm = CommunityDetector().detect_communities(kg, method="louvain")
print("communities:", comm if not isinstance(comm, dict) else {k: v for k, v in list(comm.items())[:4]})

section("(f) neighbours")
adj = {}
for rel in kg["relationships"]:
    adj.setdefault(rel["source"], set()).add(rel["target"])
    adj.setdefault(rel["target"], set()).add(rel["source"])
frontier, seen = {"C1"}, {"C1"}
for _ in range(2):
    frontier = {n for f in frontier for n in adj.get(f, ())} - seen
    seen |= frontier
print("2-hop from C1:", sorted(seen))
