"""Seed records: the procurement entities, links and raw supplier names the
graph is built from. Validated on load so a bad edit fails at startup."""

import json
from pathlib import Path

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


def load_seed(seed_dir: Path) -> Seed:
    def read(name: str, model):
        return TypeAdapter(list[model]).validate_python(json.loads((seed_dir / name).read_text()))

    seed = Seed(
        nodes=read("nodes.json", SeedNode),
        edges=read("edges.json", SeedEdge),
        registry=read("supplier_registry.json", RegistryEntry),
        suppliers_raw=read("suppliers_raw.json", RawSupplier),
    )
    ids = {n.id for n in seed.nodes}
    missing = {e.source for e in seed.edges} | {e.target for e in seed.edges}
    missing -= ids
    if missing:
        raise ValueError(f"Edges reference unknown nodes: {sorted(missing)}")
    unknown = {r.contract_id for r in seed.suppliers_raw if r.contract_id} - ids
    if unknown:
        raise ValueError(f"Supplier rows reference unknown contracts: {sorted(unknown)}")
    return seed
