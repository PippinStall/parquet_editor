from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> project root
ROOT_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Central app settings, loaded from the project-root `.env` file"""

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    backend_url: str = "http://localhost"
    backend_port: int = 8000
    frontend_url: str = "http://localhost"
    frontend_port: int = 3000

    # Comma-separated list of allowed CORS origins, or "*" for any origin
    # (fine for local/single-user use; tighten this if ever exposed publicly).
    cors_allow_origins: str = "*"

    # Directory (relative to backend/, or absolute) where uploaded files live.
    # Defaults to the existing "storage" folder so this is a no-op unless
    # explicitly overridden.
    storage_dir: str = "storage"

    @property
    def cors_allow_origins_list(self) -> list[str]:
        """Return the CORS origins as a list of strings, or ["*"] if any origin is allowed."""

        if self.cors_allow_origins.strip() == "*":
            return ["*"]

        return [
            origin.strip()
            for origin in self.cors_allow_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
