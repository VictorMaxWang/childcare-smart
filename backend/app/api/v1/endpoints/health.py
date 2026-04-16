from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.health import build_health_response
from app.core.config import Settings, get_settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return build_health_response(settings)
