from __future__ import annotations

from app.core.config import Settings
from app.providers.base import AsrProvider, TextProvider
from app.providers.mock import MockTextProvider
from app.providers.vivo_asr import MockAsrProvider, VivoAsrProvider
from app.providers.vivo_llm import VivoLlmProvider


_PLACEHOLDER_PROVIDER_VALUES = {
    "",
    "mock",
    "demo",
    "example",
    "placeholder",
    "changeme",
    "change_me",
    "todo",
    "none",
    "null",
    "yourappid",
    "yourappkey",
    "yourvivoappid",
    "yourvivoappkey",
    "yourvivoocrpath",
}


def normalize_provider_env(value: str | None) -> str:
    text = (value or "").strip()
    compact = text.lower().replace("-", "").replace("_", "").replace(" ", "")
    if not compact:
        return ""
    if compact in _PLACEHOLDER_PROVIDER_VALUES:
        return ""
    if compact.startswith("your") or compact in {"xxx", "xxxx"}:
        return ""
    return text


def _has_vivo_credentials(settings: Settings) -> bool:
    app_id = normalize_provider_env(settings.vivo_app_id)
    if not app_id:
        return False
    if not settings.vivo_app_key:
        return False
    return bool(normalize_provider_env(settings.vivo_app_key.get_secret_value()))


def can_use_vivo_text_provider(settings: Settings, *, prefer_vivo: bool = False) -> bool:
    if not _has_vivo_credentials(settings):
        return False
    if prefer_vivo:
        return True
    return settings.brain_provider.strip().lower() == "vivo"


def has_vivo_text_provider_config(settings: Settings) -> bool:
    return _has_vivo_credentials(settings)


def resolve_text_provider(settings: Settings, *, prefer_vivo: bool = False) -> TextProvider:
    if can_use_vivo_text_provider(settings, prefer_vivo=prefer_vivo):
        return VivoLlmProvider(settings)
    return MockTextProvider()


def can_use_vivo_asr_provider(settings: Settings, *, prefer_vivo: bool = False) -> bool:
    if not _has_vivo_credentials(settings):
        return False
    if prefer_vivo:
        return True
    return settings.brain_provider.strip().lower() == "vivo"


def resolve_asr_provider(settings: Settings, *, prefer_vivo: bool = False) -> AsrProvider:
    if can_use_vivo_asr_provider(settings, prefer_vivo=prefer_vivo):
        return VivoAsrProvider(settings)
    return MockAsrProvider()
