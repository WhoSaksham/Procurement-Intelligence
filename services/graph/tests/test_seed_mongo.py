import json
from pathlib import Path

import mongomock
import pytest

from app.seed import load_seed, load_seed_from_mongo

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "seed"
COLLECTIONS = {
    "graphNodes": "nodes.json",
    "graphEdges": "edges.json",
    "supplierRegistry": "supplier_registry.json",
    "suppliersRaw": "suppliers_raw.json",
}


def _mock_db(edit=None):
    client = mongomock.MongoClient()
    db = client["procurement"]
    for name, file in COLLECTIONS.items():
        docs = json.loads((FIXTURE / file).read_text())
        if edit:
            docs = edit(name, docs)
        if docs:
            db[name].insert_many(docs)
    return client


def test_mongo_loader_matches_fixture():
    client = _mock_db()
    from_mongo = load_seed_from_mongo("mongodb://unused", "procurement", client_factory=lambda _url: client)
    assert from_mongo == load_seed(FIXTURE)


def test_mongo_loader_rejects_dangling_edge():
    def edit(name, docs):
        if name == "graphEdges":
            docs[0]["target"] = "NOPE"
        return docs

    client = _mock_db(edit)
    with pytest.raises(ValueError, match="unknown nodes"):
        load_seed_from_mongo("mongodb://unused", "procurement", client_factory=lambda _url: client)


def test_mongo_loader_fails_clearly_when_not_seeded():
    client = mongomock.MongoClient()
    with pytest.raises(RuntimeError, match="not seeded"):
        load_seed_from_mongo("mongodb://unused", "procurement", client_factory=lambda _url: client)
