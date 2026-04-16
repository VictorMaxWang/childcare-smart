from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.cors import install_cors
from app.core.errors import install_error_handlers
from app.core.health import build_health_response, resolve_provider_modes
from app.core.logging import configure_logging
from app.db.repositories import build_repository_bundle
from app.schemas.common import HealthResponse
from app.services.orchestrator import shutdown_orchestrator_runtime


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    current_settings = get_settings()
    repositories = build_repository_bundle()
    provider_modes = resolve_provider_modes(current_settings)
    logger.info(
        "backend.startup environment=%s llm_provider=%s vivo_configured=%s configured_memory_backend=%s memory_backend=%s degraded=%s cors_origins=%s",
        current_settings.environment,
        provider_modes["llm"],
        build_health_response(current_settings).vivo_configured,
        repositories.configured_backend,
        repositories.backend,
        repositories.degraded,
        ",".join(current_settings.cors_origins),
    )
    if repositories.degraded:
        logger.warning(
            "backend.memory_fallback configured_backend=%s memory_backend=%s reasons=%s",
            repositories.configured_backend,
            repositories.backend,
            ",".join(repositories.errors) or "unknown",
        )
    if current_settings.environment != "development" and not current_settings.cors_origins:
        logger.warning("backend.cors_origins_missing environment=%s", current_settings.environment)

    try:
        yield
    finally:
        try:
            await shutdown_orchestrator_runtime()
        except Exception:
            logger.exception("backend.shutdown_failed")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    install_cors(app, settings)
    install_error_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/")
    async def root() -> dict[str, str]:
        current_settings = get_settings()
        return {
            "service": current_settings.app_name,
            "status": "ok",
            "version": current_settings.app_version,
        }

    @app.get("/health", response_model=HealthResponse)
    async def root_health() -> HealthResponse:
        return build_health_response(get_settings())

    return app


app = create_app()
