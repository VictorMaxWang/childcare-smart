from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.services.orchestrator import reset_orchestrator_runtime


client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_runtime_after_test():
    yield
    reset_runtime()


def reset_runtime() -> None:
    get_settings.cache_clear()
    reset_repository_bundle_cache()
    reset_orchestrator_runtime()


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def service_headers(
    *,
    secret: str = "pytest-service-secret",
    method: str = "GET",
    path: str = "/api/v1/agents/parent/storybook/media/missing-media",
    scope: dict | None = None,
) -> dict[str, str]:
    scope_token = b64url(json.dumps(scope or {}, separators=(",", ":")).encode("utf-8"))
    timestamp = str(int(time.time()))
    signed = "\n".join([method.upper(), path, timestamp, scope_token]).encode("utf-8")
    signature = b64url(hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest())
    return {
        "x-smartchildcare-service-scope": scope_token,
        "x-smartchildcare-service-timestamp": timestamp,
        "x-smartchildcare-service-path": path,
        "x-smartchildcare-service-signature": signature,
    }


def test_unsigned_agents_call_is_rejected_when_secret_is_configured(monkeypatch):
    monkeypatch.setenv("BRAIN_INTERNAL_SHARED_SECRET", "pytest-service-secret")
    monkeypatch.setenv("ENVIRONMENT", "development")
    reset_runtime()

    response = client.get("/api/v1/agents/parent/storybook/media/missing-media")

    assert response.status_code == 401
    assert "service" in response.json()["detail"]


def test_signed_agents_call_reaches_endpoint(monkeypatch):
    monkeypatch.setenv("BRAIN_INTERNAL_SHARED_SECRET", "pytest-service-secret")
    monkeypatch.setenv("ENVIRONMENT", "development")
    reset_runtime()

    path = "/api/v1/agents/parent/storybook/media/missing-media"
    response = client.get(path, headers=service_headers(path=path))

    assert response.status_code == 404


def test_production_without_secret_rejects_internal_agents(monkeypatch):
    monkeypatch.delenv("BRAIN_INTERNAL_SHARED_SECRET", raising=False)
    monkeypatch.delenv("SMARTCHILDCARE_BRAIN_INTERNAL_SECRET", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    reset_runtime()

    response = client.get("/api/v1/agents/parent/storybook/media/missing-media")

    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]
