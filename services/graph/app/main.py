"""HTTP API for the procurement knowledge graph.

Called only by the web app's server-side route handlers (never by browsers),
so every /v1 route requires the shared API key and CORS stays off.
"""

import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request

from app.engine import GraphEngine
from app.models import Analytics, GraphResponse, Health, NodeDetail, Resolution, ResolveRequest, SupplierCluster
from app.seed import load_configured_seed
from app.settings import Settings

DEFAULT_FOCUS = "C1"  # the working package's closest precedent


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    app.state.engine = GraphEngine.build(load_configured_seed(settings))
    yield


_docs = Settings().expose_docs
app = FastAPI(
    title="Procurement graph service",
    version="1.0.0",
    summary="Knowledge graph, supplier resolution and provenance built with Semantica.",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)


def engine(request: Request) -> GraphEngine:
    return request.app.state.engine


def require_key(request: Request, x_api_key: Annotated[str | None, Header()] = None) -> None:
    expected: str = request.app.state.settings.graph_api_key
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid API key")


Engine = Annotated[GraphEngine, Depends(engine)]
v1 = [Depends(require_key)]


@app.get("/health", response_model=Health, tags=["ops"])
def health(eng: Engine) -> Health:
    s = eng.stats()
    return Health(status="ok", semantica_version=s.semantica_version, stats=s)


@app.get("/v1/graph", response_model=GraphResponse, dependencies=v1, tags=["graph"])
def graph(eng: Engine, focus: str = DEFAULT_FOCUS, hops: Annotated[int, Query(ge=1, le=4)] = 2) -> GraphResponse:
    try:
        nodes, edges = eng.subgraph(focus, hops)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown node") from None
    return GraphResponse(focus=focus, nodes=nodes, edges=edges)


@app.get("/v1/full", response_model=GraphResponse, dependencies=v1, tags=["graph"])
def full(eng: Engine) -> GraphResponse:
    nodes, edges = eng.full()
    return GraphResponse(focus=None, nodes=nodes, edges=edges)


@app.get("/v1/nodes/{node_id}", response_model=NodeDetail, dependencies=v1, tags=["graph"])
def node(eng: Engine, node_id: str) -> NodeDetail:
    try:
        return eng.node(node_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown node") from None


@app.get("/v1/suppliers/clusters", response_model=list[SupplierCluster], dependencies=v1, tags=["suppliers"])
def clusters(eng: Engine) -> list[SupplierCluster]:
    return eng.clusters()


@app.post("/v1/suppliers/resolve", response_model=list[Resolution], dependencies=v1, tags=["suppliers"])
def resolve(eng: Engine, body: ResolveRequest) -> list[Resolution]:
    return eng.resolve(body.names)


@app.get("/v1/analytics", response_model=Analytics, dependencies=v1, tags=["graph"])
def analytics(eng: Engine) -> Analytics:
    return eng.analytics()
