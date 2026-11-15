from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    graph_api_key: str = "dev-key"
    # Interactive API docs (/docs, /redoc, /openapi.json). Off unless explicitly enabled,
    # so a public deployment does not publish its API map.
    expose_docs: bool = False
    seed_dir: Path = Path(__file__).resolve().parents[1] / "data" / "seed"

