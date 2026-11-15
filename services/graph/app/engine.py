"""The procurement knowledge graph, built with Semantica.

This is the only module that imports ``semantica``. What comes from Semantica:

- graph construction from structured records (``kg.GraphBuilder``)
- supplier name deduplication (``deduplication.DuplicateDetector``) and name
  similarity (``deduplication.calculate_similarity``)
- W3C PROV-O provenance and lineage (``provenance.ProvenanceManager``)
- degree centrality and Louvain communities (``kg.CentralityCalculator``,
  ``kg.CommunityDetector``)

Glue written here (see SPIKE.md): joint-venture rows are kept out of
deduplication and linked to their members; new names are resolved by scoring
them against each known cluster; neighbourhoods are a breadth-first search.
"""

from __future__ import annotations

import logging
import re
import time
import warnings
from collections import defaultdict, deque
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

warnings.filterwarnings("ignore", module="semantica")
for _name in ("semantica", "semantica.kg", "semantica.deduplication", "semantica.provenance"):
    logging.getLogger(_name).setLevel(logging.ERROR)

from semantica.deduplication import DuplicateDetector, calculate_similarity  # noqa: E402
from semantica.kg import CentralityCalculator, CommunityDetector, GraphBuilder  # noqa: E402
from semantica.provenance import ProvenanceManager  # noqa: E402

from app.models import (  # noqa: E402
    Analytics,
    Candidate,
    CentralityScore,
    CommunityAssignment,
    Edge,
    JvLink,
    Node,
    NodeDetail,
    ProvenanceRecord,
    Resolution,
    Stats,
    SupplierCluster,
    Variant,
)
from app.seed import RawSupplier, Seed, load_seed  # noqa: E402

# Name similarity (Jaro-Winkler) at or above this counts as the same firm when
# resolving a single name. Chosen in the spike: true variants score 0.93+,
# unrelated names 0.57-0.85.
RESOLVE_THRESHOLD = 0.88
DEDUP_THRESHOLD = 0.75
JV_PATTERN = re.compile(r"\bJV\b|\bjoint venture\b|\bconsortium\b|/", re.IGNORECASE)
JV_SUFFIX = re.compile(r"\s*(\bJV\b|\bjoint venture\b|\bconsortium\b)\s*$", re.IGNORECASE)
TYPE_ORDER = ["Country", "Sector", "Agency", "Project", "PAD", "Guidance", "Strategy", "Contract", "Bid evaluation", "ISR",
              "ICR", "IEG review", "Satellite analysis", "Supplier", "Joint venture", "Lesson", "Passage"]


def similarity(a: str, b: str) -> float:
    return float(calculate_similarity({"name": a}, {"name": b}, method="jaro_winkler").score)


@dataclass
class _Cluster:
    canonical_id: str
    name: str
    country: str
    variants: list[tuple[RawSupplier, float]]
    jv_links: list[tuple[str, str]]


class GraphEngine:
    """Built once at startup; read-only afterwards."""

    def __init__(self) -> None:
        self._nodes: dict[str, Node] = {}
        self._edges: list[Edge] = []
        self._adj: dict[str, set[str]] = defaultdict(set)
        self._clusters: dict[str, _Cluster] = {}
        self._prov = ProvenanceManager()
        self._analytics = Analytics(centrality=[], communities=[])
        self._stats: Stats | None = None

    # ---------- build ----------

    @classmethod
    def build(cls, seed_dir: Path) -> GraphEngine:
        t0 = time.perf_counter()
        seed = load_seed(seed_dir)
        eng = cls()
        jv_rows = [r for r in seed.suppliers_raw if JV_PATTERN.search(r.name)]
        firm_rows = [r for r in seed.suppliers_raw if not JV_PATTERN.search(r.name)]
        eng._resolve_suppliers(seed, firm_rows)

        entities, relationships, meta = eng._records(seed, firm_rows, jv_rows)
        kg = GraphBuilder(resolve_conflicts=False).build({"entities": entities, "relationships": relationships}, extract=False)
        eng._load(kg, meta)
        eng._track_provenance(seed, firm_rows, jv_rows)
        eng._compute_analytics(kg)

        eng._stats = Stats(
            nodes=len(eng._nodes),
            edges=len(eng._edges),
            suppliers_raw=len(seed.suppliers_raw),
            suppliers_canonical=len(eng._clusters),
            joint_ventures=len(jv_rows),
            merges=sum(max(0, len(c.variants) - 1) for c in eng._clusters.values()),
            build_ms=round((time.perf_counter() - t0) * 1000),
            semantica_version=version("semantica"),
        )
        return eng

    def _resolve_suppliers(self, seed: Seed, rows: list[RawSupplier]) -> None:
        """Group raw award-row names into canonical firms with Semantica's duplicate detector.

        Registered names go into the same batch as the raw names, so each group
        that contains a registered name inherits its canonical id.
        """
        for r in seed.registry:
            self._clusters[r.canonical_id] = _Cluster(r.canonical_id, r.name, r.country, [], [])
        entities = [{"id": r.canonical_id, "name": r.name, "type": "Supplier", "registered": True} for r in seed.registry]
        entities += [{"id": f"row-{r.row_id}", "name": r.name, "type": "Supplier"} for r in rows]
        by_row = {f"row-{r.row_id}": r for r in rows}

        detector = DuplicateDetector(similarity_threshold=DEDUP_THRESHOLD, confidence_threshold=0.5, use_clustering=True)
        placed: set[str] = set()
        for group in detector.detect_duplicate_groups(entities):
            registered = [e for e in group.entities if e.get("registered")]
            for e in group.entities:
                row = by_row.get(e["id"])
                if row is None:
                    continue
                if registered:
                    # Pick the registered firm this name is closest to (handles over-merged groups).
                    # The displayed score is name similarity to the registered name, so an
                    # exact match reads 1.0. (The detector's own multi-factor score also
                    # weighs properties and relationships these rows do not have.)
                    target = max(registered, key=lambda reg: similarity(row.name, reg["name"]))
                    self._clusters[target["id"]].variants.append((row, round(similarity(row.name, target["name"]), 3)))
                    placed.add(e["id"])

        # Names the batch left on their own: score against the registry directly.
        for rid, row in by_row.items():
            if rid in placed:
                continue
            best = self._best_cluster(row.name)
            if best and best[1] >= RESOLVE_THRESHOLD:
                self._clusters[best[0]].variants.append((row, round(best[1], 3)))
            else:
                new_id = f"SUP-NEW-{len(self._clusters) + 1:03d}"
                self._clusters[new_id] = _Cluster(new_id, row.name, "", [(row, 1.0)], [])

    def _best_cluster(self, name: str) -> tuple[str, float] | None:
        scored = self._score_clusters(name)
        return scored[0] if scored else None

    def _score_clusters(self, name: str) -> list[tuple[str, float]]:
        out = []
        for c in self._clusters.values():
            names = [c.name] + [v[0].name for v in c.variants]
            out.append((c.canonical_id, max(similarity(name, n) for n in names)))
        return sorted(out, key=lambda x: x[1], reverse=True)

    def _jv_members(self, row: RawSupplier) -> list[tuple[str, str, float]]:
        """(canonical_id, role, score) for each member of a joint venture; the first named is lead."""
        parts = row.members or [p.strip() for p in JV_SUFFIX.sub("", row.name).split("/") if p.strip()]
        out = []
        for i, part in enumerate(parts):
            best = self._best_cluster(part)
            if best and best[1] >= RESOLVE_THRESHOLD:
                out.append((best[0], "lead" if i == 0 else "member", round(best[1], 3)))
        return out

    def _records(self, seed: Seed, firm_rows: list[RawSupplier], jv_rows: list[RawSupplier]):
        """Entities and relationships for GraphBuilder, plus display metadata kept alongside."""
        meta: dict[str, dict] = {}
        rels: list[dict] = []

        for n in seed.nodes:
            meta[n.id] = {"type": n.type, "label": n.label, "layer": n.layer, "attrs": n.attrs, "column": n.column}
        for e in seed.edges:
            rels.append(e.model_dump())

        row_owner = {v[0].row_id: c.canonical_id for c in self._clusters.values() for v in c.variants}
        row_score = {v[0].row_id: v[1] for c in self._clusters.values() for v in c.variants}

        for c in self._clusters.values():
            awards = sum(1 for v in c.variants if v[0].contract_id)
            attrs = {"Canonical ID": c.canonical_id, "Name variants": str(len(c.variants))}
            if c.country:
                attrs["Registered in"] = c.country
            if awards:
                attrs["Awards in graph"] = str(awards)
            meta[c.canonical_id] = {"type": "Supplier", "label": c.name, "layer": "ledger", "attrs": attrs, "column": 3}

        for r in firm_rows:
            if r.contract_id:
                rels.append({"source": r.contract_id, "target": row_owner[r.row_id], "relation": "awarded to",
                             "basis": "Supplier name resolution", "confidence": min(1.0, row_score[r.row_id]),
                             "source_id": r.source, "locator": r.locator})

        for r in jv_rows:
            jv_id = f"JV-{r.row_id}"
            members = self._jv_members(r)
            meta[jv_id] = {"type": "Joint venture", "label": r.name, "layer": "ledger", "column": 3,
                           "attrs": {"Award row": r.row_id, "Members": str(len(members))}}
            for cid, role, score in members:
                rels.append({"source": jv_id, "target": cid, "relation": "member of", "role": role,
                             "basis": "JV member name resolution", "confidence": min(1.0, score),
                             "source_id": r.source, "locator": r.locator})
                self._clusters[cid].jv_links.append((jv_id, role))
            if r.contract_id:
                rels.append({"source": r.contract_id, "target": jv_id, "relation": "awarded to",
                             "basis": "Joint venture award row", "confidence": 1.0,
                             "source_id": r.source, "locator": r.locator})

        entities = [{"id": nid, "name": m["label"], "type": m["type"]} for nid, m in meta.items()]
        relationships = [{**r, "type": r["relation"]} for r in rels]
        return entities, relationships, meta

    def _load(self, kg: dict, meta: dict[str, dict]) -> None:
        order = {t: i for i, t in enumerate(TYPE_ORDER)}
        ents = sorted(kg["entities"], key=lambda e: (meta[e["id"]]["column"], order.get(meta[e["id"]]["type"], 99), meta[e["id"]]["label"]))
        rows: dict[int, int] = defaultdict(int)
        for e in ents:
            m = meta[e["id"]]
            self._nodes[e["id"]] = Node(id=e["id"], type=m["type"], label=m["label"], layer=m["layer"], attrs=m["attrs"],
                                        column=m["column"], row=rows[m["column"]], centrality=0.0, community=0)
            rows[m["column"]] += 1
        for r in kg["relationships"]:
            edge = Edge(source=r["source"], target=r["target"], relation=r["relation"], basis=r["basis"],
                        confidence=round(float(r["confidence"]), 3), role=r.get("role"), source_id=r["source_id"])
            self._edges.append(edge)
            self._adj[edge.source].add(edge.target)
            self._adj[edge.target].add(edge.source)

    def _track_provenance(self, seed: Seed, firm_rows: list[RawSupplier], jv_rows: list[RawSupplier]) -> None:
        for n in seed.nodes:
            self._prov.track_entity(n.id, source=n.source_id, source_location=n.locator, confidence=1.0)
        for c in self._clusters.values():
            for row, score in c.variants:
                self._prov.track_entity(c.canonical_id, source=row.source, source_location=row.locator,
                                        source_quote=row.name, confidence=score)
        for r in jv_rows:
            self._prov.track_entity(f"JV-{r.row_id}", source=r.source, source_location=r.locator, source_quote=r.name, confidence=1.0)
        for e in self._edges:
            self._prov.track_relationship(f"{e.source}|{e.relation}|{e.target}", source=e.source_id,
                                          confidence=e.confidence, source_entity_id=e.source, target_entity_id=e.target)

    def _compute_analytics(self, kg: dict) -> None:
        degree = CentralityCalculator().calculate_degree_centrality(kg)
        ranked = sorted(((r["node"], float(r["score"])) for r in degree["rankings"]), key=lambda x: (-x[1], x[0]))
        top = ranked[0][1] if ranked else 1.0
        communities = CommunityDetector().detect_communities(kg, method="louvain")
        assign: dict[str, int] = communities["node_assignments"]
        for nid, score in ranked:
            if nid in self._nodes:
                self._nodes[nid].centrality = round(score / top, 4) if top else 0.0
        for nid, comm in assign.items():
            if nid in self._nodes:
                self._nodes[nid].community = int(comm)
        self._analytics = Analytics(
            centrality=[CentralityScore(id=n, score=round(s / top, 4)) for n, s in ranked if n in self._nodes],
            communities=[CommunityAssignment(id=n, community=int(c)) for n, c in sorted(assign.items()) if n in self._nodes],
            modularity=communities.get("modularity"),
        )

    # ---------- queries ----------

    def stats(self) -> Stats:
        assert self._stats is not None
        return self._stats

    def subgraph(self, focus: str, hops: int) -> tuple[list[Node], list[Edge]]:
        if focus not in self._nodes:
            raise KeyError(focus)
        seen = {focus}
        queue = deque([(focus, 0)])
        while queue:
            nid, d = queue.popleft()
            if d == hops:
                continue
            for nb in self._adj[nid]:
                if nb not in seen:
                    seen.add(nb)
                    queue.append((nb, d + 1))
        nodes = sorted((self._nodes[n] for n in seen), key=lambda n: (n.column, n.row))
        edges = [e for e in self._edges if e.source in seen and e.target in seen]
        return nodes, edges

    def full(self) -> tuple[list[Node], list[Edge]]:
        return sorted(self._nodes.values(), key=lambda n: (n.column, n.row)), list(self._edges)

    def node(self, node_id: str) -> NodeDetail:
        if node_id not in self._nodes:
            raise KeyError(node_id)
        lineage = self._prov.get_lineage(node_id) or {}
        records = [
            ProvenanceRecord(
                source_id=str(p.get("source_document") or ""),
                locator=p.get("source_location"),
                quote=p.get("source_quote"),
                activity=str(p.get("activity_id") or ""),
                confidence=p.get("confidence"),
                recorded_at=str(p.get("timestamp") or ""),
            )
            for p in lineage.get("lineage_chain", [])
        ]
        neighbours = [e for e in self._edges if node_id in (e.source, e.target)]
        return NodeDetail(node=self._nodes[node_id], neighbours=neighbours, provenance=records)

    def clusters(self) -> list[SupplierCluster]:
        return [
            SupplierCluster(
                canonical_id=c.canonical_id,
                name=c.name,
                variants=[Variant(name=r.name, source=r.locator, score=s) for r, s in c.variants],
                jv_links=[JvLink(jv_id=j, role=role) for j, role in c.jv_links],  # type: ignore[arg-type]
            )
            for c in sorted(self._clusters.values(), key=lambda c: c.name)
        ]

    def resolve(self, names: list[str]) -> list[Resolution]:
        out = []
        for name in names:
            scored = self._score_clusters(name)
            candidates = [Candidate(canonical_id=cid, name=self._clusters[cid].name, score=round(s, 3)) for cid, s in scored[:3]]
            best = scored[0] if scored else None
            hit = best is not None and best[1] >= RESOLVE_THRESHOLD
            out.append(Resolution(
                input=name,
                canonical_id=best[0] if hit else None,
                name=self._clusters[best[0]].name if hit else None,
                score=round(best[1], 3) if best else 0.0,
                candidates=candidates,
            ))
        return out

    def analytics(self) -> Analytics:
        return self._analytics
