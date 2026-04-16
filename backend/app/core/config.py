import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from dotenv import dotenv_values
except ImportError:  # pragma: no cover - dotenv is available in the test env, but keep a safe fallback.
    dotenv_values = None


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_ENV_FILE_CANDIDATES = (
    BACKEND_DIR / ".env.local",
    REPO_ROOT / ".env.local",
    BACKEND_DIR / ".env.release",
    REPO_ROOT / ".env.release",
    BACKEND_DIR / ".env",
    REPO_ROOT / ".env",
)


def resolve_repo_path(value: str | Path) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    return candidate.resolve()


def resolve_settings_env_files() -> tuple[str, ...]:
    override = (os.getenv("BRAIN_ENV_FILE") or "").strip()
    if override:
        return tuple(str(resolve_repo_path(item.strip())) for item in override.split(",") if item.strip())

    return tuple(str(candidate) for candidate in DEFAULT_ENV_FILE_CANDIDATES if candidate.exists())


def _load_env_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    if dotenv_values is not None:
        raw = dotenv_values(str(path), encoding="utf-8")
        return {key: value for key, value in raw.items() if value is not None}

    values: dict[str, Any] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[7:].lstrip()
        if "=" not in stripped:
            continue
        key, raw_value = stripped.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = raw_value.strip()
        if value and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def _load_settings_values() -> dict[str, Any]:
    values: dict[str, Any] = {}
    for env_file in reversed(resolve_settings_env_files()):
        values.update(_load_env_file(Path(env_file)))
    values.update(os.environ)

    normalized: dict[str, Any] = {}
    field_name_by_env_name: dict[str, str] = {}
    for field_name, field in Settings.model_fields.items():
        field_name_by_env_name[field_name] = field_name
        field_name_by_env_name[field_name.upper()] = field_name
        validation_alias = field.validation_alias
        if validation_alias is None:
            continue

        alias_values = getattr(validation_alias, "choices", None)
        if alias_values:
            for alias in alias_values:
                alias_text = str(alias).strip()
                if not alias_text:
                    continue
                field_name_by_env_name[alias_text] = field_name
                field_name_by_env_name[alias_text.upper()] = field_name
                field_name_by_env_name[alias_text.lower()] = field_name
            continue

        alias_text = str(validation_alias).strip()
        if alias_text:
            field_name_by_env_name[alias_text] = field_name
            field_name_by_env_name[alias_text.upper()] = field_name
            field_name_by_env_name[alias_text.lower()] = field_name

    for key, value in values.items():
        if not isinstance(key, str):
            continue
        mapped_key = field_name_by_env_name.get(key) or field_name_by_env_name.get(key.upper()) or field_name_by_env_name.get(key.lower())
        if mapped_key:
            normalized[mapped_key] = value

    return normalized


class Settings(BaseSettings):
    app_name: str = "SmartChildcare Agent Brain"
    app_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, validation_alias=AliasChoices("APP_PORT", "PORT"))
    app_debug: bool = True

    allow_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    enable_mock_provider: bool = True
    brain_provider: str = "mock"
    brain_timeout_ms: int = 20_000
    request_timeout_seconds: float = 20.0

    vivo_app_id: str | None = None
    vivo_app_key: SecretStr | None = None
    vivo_base_url: str = "https://api-ai.vivo.com.cn"
    vivo_llm_model: str = "Volc-DeepSeek-V3.2"
    vivo_ocr_path: str = "/ocr/general_recognition"
    vivo_embedding_model: str = "m3e-base"
    storybook_image_provider: str = "mock"
    storybook_audio_provider: str = "auto"
    storybook_image_business_code: str = "pc"
    storybook_image_style_config: str = "4cbc9165bc615ea0815301116e7925a3"
    storybook_image_width: int = 768
    storybook_image_height: int = 1024
    storybook_image_poll_interval_ms: int = 1_200
    storybook_image_poll_timeout_ms: int = 12_000
    storybook_tts_engineid: str = "short_audio_synthesis_jovi"
    storybook_tts_voice: str = "yige"
    storybook_tts_model: str = ""
    storybook_tts_product: str = ""
    storybook_tts_package: str = ""
    storybook_tts_client_version: str = ""
    storybook_tts_system_version: str = ""
    storybook_tts_sdk_version: str = ""
    storybook_tts_android_version: str = ""
    storybook_tts_fallback_engineid: str = "short_audio_synthesis_jovi"
    storybook_tts_fallback_voice: str = "vivoHelper"
    storybook_tts_speed: int = 50
    storybook_tts_volume: int = 50
    storybook_media_cache_ttl_seconds: int = 900
    storybook_media_cache_max_entries: int = 48

    mysql_url: str | None = None
    database_url: str | None = None
    brain_memory_backend: str = "memory"
    brain_memory_sqlite_path: str | None = None

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        origins: list[str] = []
        seen: set[str] = set()
        for item in self.allow_origins.split(","):
            candidate = item.strip()
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            origins.append(candidate)
        return origins

    @property
    def app_env(self) -> str:
        return self.environment

    @property
    def vivo_llm_base_url(self) -> str:
        return f"{self.vivo_base_url.rstrip('/')}/v1"

    @property
    def resolved_mysql_url(self) -> str | None:
        return self.mysql_url or self.database_url

    @property
    def resolved_brain_memory_sqlite_path(self) -> str:
        if self.brain_memory_sqlite_path:
            return str(resolve_repo_path(self.brain_memory_sqlite_path))

        return str((BACKEND_DIR / ".local" / "agent-memory.db").resolve())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(**_load_settings_values())
