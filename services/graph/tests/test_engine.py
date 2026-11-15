from pathlib import Path

import pytest

from app.engine import GraphEngine

SEED = Path(__file__).resolve().parents[1] / "data" / "seed"
MERIDIAN = "SUP-004417"


@pytest.fixture(scope="module")
def engine() -> GraphEngine:
    return GraphEngine.build(SEED)


def test_build_counts(engine):
    s = engine.stats()
    assert s.nodes >= 40
    assert s.edges >= 60
    assert s.suppliers_canonical < s.suppliers_raw
    assert s.merges > 0
    assert s.semantica_version == "0.7.0"


def test_meridian_variants_merge(engine):
    cluster = next(c for c in engine.clusters() if c.canonical_id == MERIDIAN)
    names = {v.name: v.score for v in cluster.variants}
    assert "MERIDIAN ROAD WORKS LIMITED" in names
    assert "Meridian Rdwks (K) Ltd" in names
    assert all(score >= 0.75 for score in names.values())


def test_jv_not_merged(engine):
    jv = next(n for n in engine.subgraph(MERIDIAN, 1)[0] if n.label == "Meridian Roadworks Ltd / Tana Civil JV")
    assert jv.type == "Joint venture"
    edges = [e for e in engine.subgraph(jv.id, 1)[1] if e.relation == "member of"]
    lead = next(e for e in edges if e.target == MERIDIAN)
    assert lead.role == "lead"
    assert any(e.role == "member" and e.target == "SUP-004502" for e in edges)
    cluster = next(c for c in engine.clusters() if c.canonical_id == MERIDIAN)
    assert "Meridian Roadworks Ltd / Tana Civil JV" not in {v.name for v in cluster.variants}
    assert any(link.jv_id == jv.id and link.role == "lead" for link in cluster.jv_links)


def test_listed_jv_members_resolve(engine):
    jv = next(n for n in engine.subgraph("RRA-C-02", 1)[0] if n.type == "Joint venture")
    targets = {e.target: e.role for e in engine.subgraph(jv.id, 1)[1] if e.relation == "member of"}
    assert targets == {"SUP-007731": "lead", "SUP-007790": "member"}


def test_contract_awarded_to_canonical_supplier(engine):
    nodes, edges = engine.subgraph("C1", 1)
    award = next(e for e in edges if e.relation == "awarded to")
    assert award.target == MERIDIAN
    assert award.basis == "Supplier name resolution"


def test_every_edge_and_node_has_provenance(engine):
    nodes, edges = engine.subgraph("C1", 99)
    assert len(nodes) == engine.stats().nodes
    for e in edges:
        assert e.source_id
    for n in nodes:
        assert engine.node(n.id).provenance, n.id


def test_subgraph_default(engine):
    ids = {n.id for n in engine.subgraph("C1", 2)[0]}
    assert {MERIDIAN, "P171204", "BER", "L1"} <= ids
    assert "PS-cpf1" not in ids


def test_unknown_focus(engine):
    with pytest.raises(KeyError):
        engine.subgraph("nope", 2)
    with pytest.raises(KeyError):
        engine.node("nope")


def test_resolve_new_name(engine):
    hit, miss = engine.resolve(["Meridian Roadworks Limited", "Zebra Holdings"])
    assert hit.canonical_id == MERIDIAN
    assert hit.score >= 0.88
    assert hit.name == "Meridian Roadworks Ltd"
    assert miss.canonical_id is None
    assert miss.name is None
    assert miss.candidates


def test_analytics(engine):
    a = engine.analytics()
    scores = [c.score for c in a.centrality]
    assert scores == sorted(scores, reverse=True)
    assert scores
    assert {c.id for c in a.communities} == {n.id for n in engine.subgraph("C1", 99)[0]}


def test_node_layout_hints(engine):
    nodes, _ = engine.subgraph("C1", 99)
    supplier = next(n for n in nodes if n.id == MERIDIAN)
    assert supplier.column == 3
    assert all(0 <= n.column <= 3 for n in nodes)
    assert all(0 <= n.centrality <= 1 for n in nodes)
