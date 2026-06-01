from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.services.orchestrator import reset_orchestrator_runtime


client = TestClient(app)

VIVO_ENV_KEYS = [
    "BRAIN_PROVIDER",
    "VIVO_APP_ID",
    "VIVO_APP_KEY",
    "VIVO_BASE_URL",
    "VIVO_LLM_MODEL",
    "STORYBOOK_TTS_MODEL",
    "STORYBOOK_TTS_PRODUCT",
    "STORYBOOK_TTS_PACKAGE",
    "STORYBOOK_TTS_CLIENT_VERSION",
    "STORYBOOK_TTS_SYSTEM_VERSION",
    "STORYBOOK_TTS_SDK_VERSION",
    "STORYBOOK_TTS_ANDROID_VERSION",
]


def reset_runtime(monkeypatch) -> None:
    get_settings.cache_clear()
    reset_repository_bundle_cache()
    reset_orchestrator_runtime()


def isolate_provider_env(monkeypatch, tmp_path, values: dict[str, str] | None = None) -> None:
    env_file = tmp_path / "empty.env"
    env_file.write_text("", encoding="utf-8")
    monkeypatch.setenv("BRAIN_ENV_FILE", str(env_file))
    for key in VIVO_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    for key, value in (values or {}).items():
        monkeypatch.setenv(key, value)
    reset_runtime(monkeypatch)


def assert_no_secret_values(payload_text: str, *values: str) -> None:
    for value in values:
        assert value not in payload_text


def test_health(tmp_path, monkeypatch):
    isolate_provider_env(monkeypatch, tmp_path)

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "SmartChildcare Agent Brain"
    assert body["providers"]["llm"] == "mock"
    assert body["brain_provider"] in {"mock", "vivo"}
    assert body["llm_provider_selected"] in {"mock-brain", "vivo-llm"}
    assert body["provider_assertion_scope"] == "configuration_only"
    assert body["providers"]["ocr"] == "fallback"
    assert body["providers"]["asr"] == "mock"
    assert body["providers"]["tts"] == "fallback"
    assert body["provider_status"]["ocr"]["providerName"] == "text-ocr-fallback"
    assert body["provider_status"]["ocr"]["state"] == "fallback"
    assert body["provider_status"]["ocr"]["mock"] is False
    assert body["provider_status"]["ocr"]["live"] is False
    assert body["memory_backend"] in {"sqlite", "memory", "mysql"}
    assert body["vivo_credentials_configured"] is False


def test_root_health_alias():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "SmartChildcare Agent Brain"
    assert body["provider_assertion_scope"] == "configuration_only"


def test_health_treats_placeholder_provider_env_as_missing(tmp_path, monkeypatch):
    isolate_provider_env(
        monkeypatch,
        tmp_path,
        {
            "BRAIN_PROVIDER": "vivo",
            "VIVO_APP_ID": "your_appid",
            "VIVO_APP_KEY": "your_appkey",
            "VIVO_BASE_URL": "https://api-ai.vivo.com.cn",
            "VIVO_LLM_MODEL": "Volc-DeepSeek-V3.2",
        },
    )

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"]["llm"] == "mock"
    assert body["provider_status"]["llm"]["state"] == "mock"
    assert body["provider_status"]["llm"]["configured"] is False
    assert body["provider_status"]["llm"]["live"] is False
    assert body["vivo_credentials_configured"] is False
    assert_no_secret_values(response.text, "your_appid", "your_appkey")


def test_health_reports_partial_provider_env_without_values(tmp_path, monkeypatch):
    isolate_provider_env(
        monkeypatch,
        tmp_path,
        {
            "BRAIN_PROVIDER": "vivo",
            "VIVO_APP_ID": "partial-real-app-id",
        },
    )

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"]["llm"] == "mock"
    assert body["provider_status"]["llm"]["status"] == "missing-env"
    assert body["provider_status"]["llm"]["configured"] is False
    assert "VIVO_APP_KEY" in body["provider_status"]["llm"]["requiredEnv"]
    assert_no_secret_values(response.text, "partial-real-app-id")


def test_health_reports_configured_without_claiming_live_or_leaking_secrets(tmp_path, monkeypatch):
    app_id = "fake-real-app-id"
    app_key = "super-secret-health-key"
    isolate_provider_env(
        monkeypatch,
        tmp_path,
        {
            "BRAIN_PROVIDER": "vivo",
            "VIVO_APP_ID": app_id,
            "VIVO_APP_KEY": app_key,
            "VIVO_BASE_URL": "https://api.example.invalid",
            "VIVO_LLM_MODEL": "fake-real-llm-model",
            "STORYBOOK_TTS_MODEL": "fake-tts-model",
            "STORYBOOK_TTS_PRODUCT": "fake-tts-product",
            "STORYBOOK_TTS_PACKAGE": "com.example.fake",
            "STORYBOOK_TTS_CLIENT_VERSION": "1.0.0",
            "STORYBOOK_TTS_SYSTEM_VERSION": "1",
            "STORYBOOK_TTS_SDK_VERSION": "1",
            "STORYBOOK_TTS_ANDROID_VERSION": "13",
        },
    )

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"]["llm"] == "configured"
    assert body["providers"]["asr"] == "configured"
    assert body["providers"]["tts"] == "configured"
    assert body["providers"]["ocr"] == "fallback"
    assert body["provider_status"]["llm"]["live"] is False
    assert body["provider_status"]["asr"]["live"] is False
    assert body["provider_status"]["tts"]["live"] is False
    assert body["provider_status"]["ocr"]["live"] is False
    assert body["vivo_credentials_configured"] is True
    assert_no_secret_values(response.text, app_id, app_key)


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
