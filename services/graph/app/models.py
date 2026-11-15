"""API contract. These pydantic models are the source of the OpenAPI schema,
from which the web app generates its TypeScript types."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

Layer = Literal["ledger", "procedure", "retrospective", "context"]


class Node(BaseModel):
    id: str
    type: str
    label: str
    layer: Layer
    attrs: dict[str, str]
    column: int = Field(ge=0, le=3, description="Layout column by entity type")
    row: int = Field(ge=0, description="Layout row within the column")
    centrality: float = Field(ge=0, le=1, description="Degree centrality, normalised to the most connected node")
    community: int


class Edge(BaseModel):
    source: str
    target: str
    relation: str
    basis: str = Field(description="How the link was made: shared key or scored match")
    confidence: float = Field(ge=0, le=1)
    role: str | None = None
    source_id: str = Field(description="Evidence source the link came from")


class ProvenanceRecord(BaseModel):
    source_id: str
    locator: str | None
    quote: str | None = None
    activity: str
    confidence: float | None
    recorded_at: str


class NodeDetail(BaseModel):
    node: Node
    neighbours: list[Edge]
    provenance: list[ProvenanceRecord]


class GraphResponse(BaseModel):
    focus: str | None
    nodes: list[Node]
    edges: list[Edge]


class Variant(BaseModel):
    name: str
    source: str
    score: float


class JvLink(BaseModel):
    jv_id: str
    role: Literal["lead", "member"]


class SupplierCluster(BaseModel):
    canonical_id: str
    name: str
    variants: list[Variant]
    jv_links: list[JvLink]


class Candidate(BaseModel):
    canonical_id: str
    name: str
    score: float


class Resolution(BaseModel):
    input: str
    canonical_id: str | None
    name: str | None
    score: float
    candidates: list[Candidate]


SupplierName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ResolveRequest(BaseModel):
    names: list[SupplierName] = Field(min_length=1, max_length=50)

    @field_validator("names", mode="before")
    @classmethod
    def _reject_overlong(cls, v):
        # Length is checked before stripping so padding cannot smuggle in long input.
        if isinstance(v, list) and any(isinstance(n, str) and len(n) > 200 for n in v):
            raise ValueError("Each name must be at most 200 characters")
        return v


class CentralityScore(BaseModel):
    id: str
    score: float


class CommunityAssignment(BaseModel):
    id: str
    community: int


class Analytics(BaseModel):
    centrality: list[CentralityScore]
    communities: list[CommunityAssignment]
    modularity: float | None = None


class Stats(BaseModel):
    nodes: int
    edges: int
    suppliers_raw: int
    suppliers_canonical: int
    joint_ventures: int
    merges: int
    build_ms: int
    semantica_version: str


class Health(BaseModel):
    status: Literal["ok"]
    semantica_version: str
    stats: Stats
