from __future__ import annotations

from app.core.config import Settings
from app.db.repositories import build_repository_bundle
from app.providers.resolver import can_use_vivo_text_provider, has_vivo_text_provider_config
from app.schemas.common import HealthResponse


def resolve_provider_modes(settings: Settings) -> dict[str, str]:
    llm_mode = "vivo" if can_use_vivo_text_provider(settings) else "mock"
    return {
        "llm": llm_mode,
        "ocr": "mock",
        "asr": "mock",
        "tts": "mock",
    }


def resolve_llm_provider_selected(settings: Settings) -> str:
    return "vivo-llm" if can_use_vivo_text_provider(settings) else "mock-brain"


def build_health_response(settings: Settings) -> HealthResponse:
    repositories = build_repository_bundle()
    brain_provider = settings.brain_provider.strip().lower()
    vivo_credentials_configured = has_vivo_text_provider_config(settings)
    return HealthResponse(
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        providers=resolve_provider_modes(settings),
        brain_provider=brain_provider,
        llm_provider_selected=resolve_llm_provider_selected(settings),
        provider_assertion_scope="configuration_only",
        configured_memory_backend=repositories.configured_backend,
        memory_backend=repositories.backend,
        degraded=repositories.degraded,
        degradation_reasons=list(repositories.errors),
        vivo_configured=vivo_credentials_configured,
        vivo_credentials_configured=vivo_credentials_configured,
    )
