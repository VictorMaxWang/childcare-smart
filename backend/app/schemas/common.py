from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class FlexibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class GenericPayload(FlexibleModel):
    data: dict[str, Any] = Field(default_factory=dict)


class ApiError(BaseModel):
    model_config = ConfigDict(extra="ignore")

    error: str
    details: str | None = None


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: Literal["ok"] = "ok"
    service: str
    version: str
    environment: str
    providers: dict[str, str] = Field(default_factory=dict)
    brain_provider: str | None = None
    llm_provider_selected: str | None = None
    provider_assertion_scope: Literal["configuration_only"] = "configuration_only"
    configured_memory_backend: str | None = None
    memory_backend: str | None = None
    degraded: bool = False
    degradation_reasons: list[str] = Field(default_factory=list)
    vivo_configured: bool = False
    vivo_credentials_configured: bool = False


class StreamEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    event: str
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = None
