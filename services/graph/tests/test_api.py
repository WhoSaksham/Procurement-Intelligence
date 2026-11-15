import os

import pytest

os.environ["GRAPH_API_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models import GraphResponse, NodeDetail  # noqa: E402

KEY = {"X-API-Key": "test-key"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_open(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["stats"]["nodes"] >= 40
    assert body["semantica_version"] == "0.7.0"


def test_requires_key(client):
    assert client.get("/v1/graph").status_code == 401
    assert client.get("/v1/graph", headers={"X-API-Key": "wrong"}).status_code == 401


def test_graph_shape(client):
    r = client.get("/v1/graph", params={"focus": "C1", "hops": 2}, headers=KEY)
    assert r.status_code == 200
    g = GraphResponse.model_validate(r.json())
    ids = {n.id for n in g.nodes}
    assert g.focus == "C1"
    assert all(e.source in ids and e.target in ids for e in g.edges)


def test_graph_defaults_to_closest_precedent(client):
    r = client.get("/v1/graph", headers=KEY)
    assert r.status_code == 200
    assert r.json()["focus"] == "C1"


def test_node_detail(client):
    r = client.get("/v1/nodes/SUP-004417", headers=KEY)
    assert r.status_code == 200
    d = NodeDetail.model_validate(r.json())
    assert d.provenance
    assert any(e.relation == "awarded to" for e in d.neighbours)


def test_unknown_node_404(client):
    assert client.get("/v1/nodes/nope", headers=KEY).status_code == 404
    r = client.get("/v1/graph", params={"focus": "nope"}, headers=KEY)
    assert r.status_code == 404
    assert r.json() == {"detail": "Unknown node"}


def test_hops_bounds(client):
    assert client.get("/v1/graph", params={"hops": 0}, headers=KEY).status_code == 422
    assert client.get("/v1/graph", params={"hops": 5}, headers=KEY).status_code == 422


def test_resolve_validation(client):
    for body in ({"names": []}, {"names": ["   "]}, {"names": ["x" * 201]}, {"names": ["a"] * 51}, {}):
        assert client.post("/v1/suppliers/resolve", json=body, headers=KEY).status_code == 422, body


def test_resolve_ok(client):
    r = client.post("/v1/suppliers/resolve", json={"names": [" Meridian Roadworks Limited ", "Zebra Holdings"]}, headers=KEY)
    assert r.status_code == 200
    hit, miss = r.json()
    assert hit["input"] == "Meridian Roadworks Limited"
    assert hit["canonical_id"] == "SUP-004417"
    assert miss["canonical_id"] is None


def test_clusters_and_analytics(client):
    clusters = client.get("/v1/suppliers/clusters", headers=KEY).json()
    assert any(c["canonical_id"] == "SUP-004417" for c in clusters)
    a = client.get("/v1/analytics", headers=KEY).json()
    assert a["centrality"][0]["score"] == 1.0


def test_full_graph(client):
    r = client.get("/v1/full", headers=KEY)
    assert r.status_code == 200
    assert len(r.json()["nodes"]) == client.get("/health").json()["stats"]["nodes"]


def test_docs_hidden_by_default(client):
    # The API map is not published unless EXPOSE_DOCS=true (local development).
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_openapi_still_exportable():
    # scripts/export_openapi.py generates the contract from the app object directly.
    schema = app.openapi()
    assert "/v1/suppliers/resolve" in schema["paths"]
