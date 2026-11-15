from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    graph_api_key: str = "dev-key"
    seed_dir: Path = Path(__file__).resolve().parents[1] / "data" / "seed"

