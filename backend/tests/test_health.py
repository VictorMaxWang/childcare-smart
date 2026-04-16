from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.services.orchestrator import reset_orchestrator_runtime


client = TestClient(app)


def reset_runtime(monkeypatch) -> None:
    get_settings.cache_clear()
    reset_repository_bundle_cache()
    reset_orchestrator_runtime()


def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "SmartChildcare Agent Brain"
    assert body["providers"]["llm"] in {"mock", "vivo"}
    assert body["brain_provider"] in {"mock", "vivo"}
    assert body["llm_provider_selected"] in {"mock-brain", "vivo-llm"}
    assert body["provider_assertion_scope"] == "configuration_only"
    assert body["providers"]["ocr"] == "mock"
    assert body["memory_backend"] in {"sqlite", "memory", "mysql"}
    assert isinstance(body["vivo_credentials_configured"], bool)


def test_root_health_alias():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "SmartChildcare Agent Brain"
    assert body["provider_assertion_scope"] == "configuration_only"


def test_health_falls_back_from_mysql_to_sqlite_when_mysql_url_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_MEMORY_BACKEND", "mysql")
    monkeypatch.setenv("BRAIN_MEMORY_SQLITE_PATH", str(tmp_path / "health-fallback.db"))
    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    reset_runtime(monkeypatch)

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["configured_memory_backend"] == "mysql"
    assert body["memory_backend"] == "sqlite"
    assert body["degraded"] is True
    assert "mysql:missing_mysql_url" in body["degradation_reasons"]
