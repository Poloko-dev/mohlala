from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Read from the environment (prefix POI_) or backend/.env; see .env.example."""

    model_config = SettingsConfigDict(env_prefix="POI_", env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "Lesotho POI location intelligence"
    api_prefix: str = "/api/v1"

    # Trained model (the files of model_outputs_v2/) and the data the model's graph is built from
    model_dir: Path = BACKEND_DIR / "model"
    data_dir: Path = BACKEND_DIR / "data"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Background jobs (suggest, batch): scored one at a time by default, since each scoring uses every CPU core
    job_workers: int = 1
    job_ttl_seconds: int = 3600
    suggest_max_points: int = 300
    batch_max_rows: int = 1000
    batch_max_bytes: int = 2_000_000
    torch_threads: int | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
