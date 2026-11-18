"""Seed records: the procurement entities, links and raw supplier names the
graph is built from. Read from MongoDB (seeded by services/api) or, for tests
and offline runs, from JSON files. Validated on load so bad data fails at startup."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, TypeAdapter

from app.models import Layer


class SeedNode(BaseModel):
    id: str
    type: str
    label: str
    layer: Layer
    attrs: dict[str, str]
    source_id: str
    locator: str
    column: int = Field(ge=0, le=3)


class SeedEdge(BaseModel):
    source: str
    target: str
    relation: str
    basis: str
    confidence: float = Field(ge=0, le=1)
    source_id: str
    locator: str


class RegistryEntry(BaseModel):
    canonical_id: str
    name: str
    country: str


class RawSupplier(BaseModel):
    row_id: str
    name: str
    source: str
    locator: str
    contract_id: str | None = None
    members: list[str] | None = None


class Seed(BaseModel):
    nodes: list[SeedNode]
    edges: list[SeedEdge]
    registry: list[RegistryEntry]
    suppliers_raw: list[RawSupplier]


# MongoDB collections written by the API seeder (services/api/src/seed/derive-graph.ts).
COLLECTIONS = {
    "nodes": "graphNodes",
    "edges": "graphEdges",
    "registry": "supplierRegistry",
    "suppliers_raw": "suppliersRaw",
}


def _validate(seed: Seed) -> Seed:
    ids = {n.id for n in seed.nodes}
    missing = {e.source for e in seed.edges} | {e.target for e in seed.edges}
    missing -= ids
    if missing:
        raise ValueError(f"Edges reference unknown nodes: {sorted(missing)}")
    unknown = {r.contract_id for r in seed.suppliers_raw if r.contract_id} - ids
    if unknown:
        raise ValueError(f"Supplier rows reference unknown contracts: {sorted(unknown)}")
    return seed


def _build(raw: dict[str, list[dict[str, Any]]]) -> Seed:
    def read(key: str, model):
        return TypeAdapter(list[model]).validate_python(raw[key])

    return _validate(
        Seed(
            nodes=read("nodes", SeedNode),
            edges=read("edges", SeedEdge),
            registry=read("registry", RegistryEntry),
            suppliers_raw=read("suppliers_raw", RawSupplier),
        )
    )


def load_seed(seed_dir: Path) -> Seed:
    files = {"nodes": "nodes.json", "edges": "edges.json", "registry": "supplier_registry.json", "suppliers_raw": "suppliers_raw.json"}
    return _build({key: json.loads((seed_dir / name).read_text()) for key, name in files.items()})


def load_seed_from_mongo(url: str, db: str, client_factory: Callable[[str], Any] | None = None) -> Seed:
    """Read the graph seed collections the API seeder wrote. Field names match the JSON files."""
    if client_factory is None:
        from pymongo import MongoClient

        def client_factory(u: str) -> Any:
            return MongoClient(u, serverSelectionTimeoutMS=5000)

    client = client_factory(url)
    try:
        database = client[db]
        raw = {key: list(database[name].find({}, {"_id": 0})) for key, name in COLLECTIONS.items()}
    finally:
        client.close()
    if not raw["nodes"]:
        raise RuntimeError(f"MongoDB database '{db}' is not seeded with graph data; start the API (it seeds on startup) or run `npm run seed` in services/api")
    return _build(raw)


def load_configured_seed(settings: Any) -> Seed:
    """Seed from MongoDB when MONGO_URL is set, else from SEED_DIR."""
    import logging

    log = logging.getLogger("uvicorn.error")
    if settings.mongo_url:
        log.info("Loading graph seed from MongoDB database '%s'", settings.mongo_db)
        return load_seed_from_mongo(settings.mongo_url, settings.mongo_db)
    if settings.seed_dir:
        log.info("Loading graph seed from %s", settings.seed_dir)
        return load_seed(Path(settings.seed_dir))
    raise RuntimeError("Set MONGO_URL (seeded by services/api) or SEED_DIR to a directory of graph seed JSON files")
