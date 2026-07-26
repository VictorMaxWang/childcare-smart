import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import stream as stream_endpoints
from app.core.config import get_settings
from app.main import app


client = TestClient(app)
STREAM_PATH = "/api/v1/stream/agent"
INTERNAL_SERVICE_SECRET = "pytest-stream-internal-secret"


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _service_headers(*, secret: str) -> dict[str, str]:
    scope_token = _b64url(
        json.dumps(
            {
                "institutionId": "inst-pytest",
                "role": "teacher",
                "accountKind": "normal",
                "childIds": ["child-pytest"],
            },
            separators=(",", ":"),
        ).encode("utf-8")
    )
    timestamp = str(int(time.time()))
    signed = "\n".join(["POST", STREAM_PATH, timestamp, scope_token]).encode("utf-8")
    signature = _b64url(
        hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    )
    return {
        "x-smartchildcare-service-scope": scope_token,
        "x-smartchildcare-service-timestamp": timestamp,
        "x-smartchildcare-service-path": STREAM_PATH,
        "x-smartchildcare-service-signature": signature,
    }


@pytest.fixture
def internal_service_secret(monkeypatch):
    monkeypatch.setenv("BRAIN_INTERNAL_SHARED_SECRET", INTERNAL_SERVICE_SECRET)
    get_settings.cache_clear()
    yield INTERNAL_SERVICE_SECRET
    get_settings.cache_clear()


def test_stream_agent_rejects_unauthorized_before_orchestration(
    internal_service_secret,
):
    dependency_calls: list[str] = []

    def resolve_orchestrator():
        dependency_calls.append(STREAM_PATH)
        raise AssertionError("orchestrator dependency must not run before service auth")

    app.dependency_overrides[stream_endpoints.get_orchestrator] = resolve_orchestrator
    try:
        anonymous = client.post(
            STREAM_PATH,
            json={"task": "teacher-agent", "prompt": "test"},
        )
        assert anonymous.status_code == 401
        assert dependency_calls == []

        wrong_key = client.post(
            STREAM_PATH,
            json={"task": "teacher-agent", "prompt": "test"},
            headers=_service_headers(secret="wrong-internal-secret"),
        )
        assert wrong_key.status_code == 401
        assert dependency_calls == []
    finally:
        app.dependency_overrides.pop(stream_endpoints.get_orchestrator, None)


def test_stream_agent_accepts_valid_internal_service(internal_service_secret):
    response = client.post(
        STREAM_PATH,
        json={"task": "teacher-agent", "prompt": "test"},
        headers=_service_headers(secret=internal_service_secret),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    text = response.text
    assert "event: meta" in text
    assert "event: final" in text
