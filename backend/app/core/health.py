from __future__ import annotations

from app.core.config import Settings
from app.db.repositories import build_repository_bundle
from app.providers.resolver import can_use_vivo_text_provider, has_vivo_text_provider_config, normalize_provider_env
from app.schemas.common import HealthResponse, ProviderCapability, ProviderCapabilityStatus


_LLM_REQUIRED_ENV = ("VIVO_APP_ID", "VIVO_APP_KEY", "VIVO_BASE_URL", "VIVO_LLM_MODEL")
_ASR_REQUIRED_ENV = ("VIVO_APP_ID", "VIVO_APP_KEY", "VIVO_BASE_URL")
_TTS_REQUIRED_ENV = (
    "VIVO_APP_ID",
    "VIVO_APP_KEY",
    "VIVO_BASE_URL",
    "STORYBOOK_TTS_MODEL",
    "STORYBOOK_TTS_PRODUCT",
    "STORYBOOK_TTS_PACKAGE",
    "STORYBOOK_TTS_CLIENT_VERSION",
    "STORYBOOK_TTS_SYSTEM_VERSION",
    "STORYBOOK_TTS_SDK_VERSION",
    "STORYBOOK_TTS_ANDROID_VERSION",
)


def _secret_value(settings: Settings, env_name: str) -> str:
    if env_name == "VIVO_APP_KEY" and settings.vivo_app_key:
        return settings.vivo_app_key.get_secret_value()
    return ""


def _settings_value(settings: Settings, env_name: str) -> str:
    if env_name == "VIVO_APP_ID":
        return settings.vivo_app_id or ""
    if env_name == "VIVO_APP_KEY":
        return _secret_value(settings, env_name)
    if env_name == "VIVO_BASE_URL":
        return settings.vivo_base_url
    if env_name == "VIVO_LLM_MODEL":
        return settings.vivo_llm_model
    if env_name == "STORYBOOK_TTS_MODEL":
        return settings.storybook_tts_model
    if env_name == "STORYBOOK_TTS_PRODUCT":
        return settings.storybook_tts_product
    if env_name == "STORYBOOK_TTS_PACKAGE":
        return settings.storybook_tts_package
    if env_name == "STORYBOOK_TTS_CLIENT_VERSION":
        return settings.storybook_tts_client_version
    if env_name == "STORYBOOK_TTS_SYSTEM_VERSION":
        return settings.storybook_tts_system_version
    if env_name == "STORYBOOK_TTS_SDK_VERSION":
        return settings.storybook_tts_sdk_version
    if env_name == "STORYBOOK_TTS_ANDROID_VERSION":
        return settings.storybook_tts_android_version
    return ""


def _missing_env(settings: Settings, required_env: tuple[str, ...]) -> list[str]:
    return [env_name for env_name in required_env if not normalize_provider_env(_settings_value(settings, env_name))]


def _configured_status(
    *,
    provider_name: str,
    capability: ProviderCapability,
    required_env: tuple[str, ...],
    reason: str,
) -> ProviderCapabilityStatus:
    return ProviderCapabilityStatus(
        providerName=provider_name,
        capability=capability,
        state="configured",
        configured=True,
        live=False,
        fallback=False,
        mock=False,
        supported=True,
        isRealProvider=True,
        status="ready",
        reason=reason,
        requiredEnv=list(required_env),
        warnings=["Health only verifies configuration; live is reported only by request results."],
    )


def _missing_status(
    *,
    provider_name: str,
    capability: ProviderCapability,
    state: str,
    required_env: tuple[str, ...],
    missing_env: list[str],
    reason: str,
) -> ProviderCapabilityStatus:
    return ProviderCapabilityStatus(
        providerName=provider_name,
        capability=capability,
        state=state,  # type: ignore[arg-type]
        configured=False,
        live=False,
        fallback=state == "fallback",
        mock=state == "mock",
        supported=True,
        isRealProvider=False,
        status="missing-env",
        reason=reason,
        requiredEnv=list(required_env),
        warnings=[f"Missing or placeholder env: {', '.join(missing_env)}"] if missing_env else [],
    )


def resolve_provider_status(settings: Settings) -> dict[ProviderCapability, ProviderCapabilityStatus]:
    brain_provider = settings.brain_provider.strip().lower()
    llm_missing = _missing_env(settings, _LLM_REQUIRED_ENV)
    asr_missing = _missing_env(settings, _ASR_REQUIRED_ENV)
    tts_missing = _missing_env(settings, _TTS_REQUIRED_ENV)

    if not llm_missing and brain_provider == "vivo":
        llm_status = _configured_status(
            provider_name="vivo-llm",
            capability="llm",
            required_env=_LLM_REQUIRED_ENV,
            reason="Vivo LLM configuration is present; live is not asserted by health.",
        )
    else:
        missing = llm_missing or ["BRAIN_PROVIDER=vivo"]
        llm_status = _missing_status(
            provider_name="mock-brain",
            capability="llm",
            state="mock",
            required_env=_LLM_REQUIRED_ENV,
            missing_env=missing,
            reason="Vivo LLM is not selected/configured; deterministic mock brain is selected.",
        )

    if not asr_missing and brain_provider == "vivo":
        asr_status = _configured_status(
            provider_name="vivo-asr",
            capability="asr",
            required_env=_ASR_REQUIRED_ENV,
            reason="Vivo ASR configuration is present; live is not asserted by health.",
        )
    else:
        missing = asr_missing or ["BRAIN_PROVIDER=vivo"]
        asr_status = _missing_status(
            provider_name="mock-asr",
            capability="asr",
            state="mock",
            required_env=_ASR_REQUIRED_ENV,
            missing_env=missing,
            reason="Vivo ASR is not selected/configured; mock ASR remains explicit.",
        )

    if not tts_missing:
        tts_status = _configured_status(
            provider_name="vivo-tts",
            capability="tts",
            required_env=_TTS_REQUIRED_ENV,
            reason="Vivo TTS configuration is present; live is not asserted by health.",
        )
    else:
        tts_status = _missing_status(
            provider_name="text-only-tts-fallback",
            capability="tts",
            state="fallback",
            required_env=_TTS_REQUIRED_ENV,
            missing_env=tts_missing,
            reason="Vivo TTS env/runtime metadata is incomplete; text/script fallback is the only safe status.",
        )

    ocr_status = ProviderCapabilityStatus(
        providerName="text-ocr-fallback",
        capability="ocr",
        state="fallback",
        configured=False,
        live=False,
        fallback=True,
        mock=False,
        supported=True,
        isRealProvider=False,
        status="provider-unavailable",
        reason="FastAPI has no verified binary OCR transport; health-file bridge uses request-supplied text only.",
        requiredEnv=[],
        warnings=[
            "OCR fallback is deterministic text extraction from request metadata.",
            "No live OCR capability is claimed by FastAPI health.",
        ],
    )

    return {
        "llm": llm_status,
        "ocr": ocr_status,
        "asr": asr_status,
        "tts": tts_status,
    }


def resolve_provider_modes(settings: Settings) -> dict[str, str]:
    return {capability: status.state for capability, status in resolve_provider_status(settings).items()}


def resolve_llm_provider_selected(settings: Settings) -> str:
    return "vivo-llm" if can_use_vivo_text_provider(settings) else "mock-brain"


def build_health_response(settings: Settings) -> HealthResponse:
    repositories = build_repository_bundle()
    brain_provider = settings.brain_provider.strip().lower()
    vivo_credentials_configured = has_vivo_text_provider_config(settings)
    provider_status = resolve_provider_status(settings)
    return HealthResponse(
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        providers={capability: status.state for capability, status in provider_status.items()},
        provider_status=provider_status,
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
