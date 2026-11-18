from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    graph_api_key: str = "dev-key"
    # Interactive API docs (/docs, /redoc, /openapi.json). Off unless explicitly enabled,
    # so a public deployment does not publish its API map.
    expose_docs: bool = False
    # Graph seed source: MongoDB when MONGO_URL is set (normal runs), otherwise
    # JSON files in SEED_DIR (tests and offline runs use tests/fixtures/seed).
    mongo_url: str | None = None
    mongo_db: str = "procurement"
    seed_dir: Path | None = None

