from __future__ import annotations

from pathlib import Path

from app.core import config as config_module
from app.core.config import REPO_ROOT, Settings, get_settings, resolve_repo_path, resolve_settings_env_files


def test_resolve_settings_env_files_prefers_backend_local_then_repo_local_then_release(tmp_path, monkeypatch):
    backend_local = tmp_path / "backend.env.local"
    repo_local = tmp_path / "repo.env.local"
    backend_release = tmp_path / "backend.env.release"
    repo_release = tmp_path / "repo.env.release"
    backend_env = tmp_path / "backend.env"
    repo_env = tmp_path / "repo.env"
    backend_local.write_text("APP_NAME=Backend Local\n", encoding="utf-8")
    repo_local.write_text("APP_NAME=Repo Local\n", encoding="utf-8")
    backend_release.write_text("APP_NAME=Backend Release\n", encoding="utf-8")
    repo_release.write_text("APP_NAME=Repo Release\n", encoding="utf-8")
    backend_env.write_text("APP_NAME=Backend Env\n", encoding="utf-8")
    repo_env.write_text("APP_NAME=Repo Env\n", encoding="utf-8")

    monkeypatch.delenv("BRAIN_ENV_FILE", raising=False)
    monkeypatch.setattr(
        config_module,
        "DEFAULT_ENV_FILE_CANDIDATES",
        (
            backend_local,
            repo_local,
            backend_release,
            repo_release,
            backend_env,
            repo_env,
        ),
    )

    assert resolve_settings_env_files() == (
        str(backend_local),
        str(repo_local),
        str(backend_release),
        str(repo_release),
        str(backend_env),
        str(repo_env),
    )


def test_brain_env_file_override_is_honored(tmp_path, monkeypatch):
    env_file = tmp_path / "custom.release.env"
    env_file.write_text("APP_NAME=Custom Release Brain\n", encoding="utf-8")
    monkeypatch.setenv("BRAIN_ENV_FILE", str(env_file))
    get_settings.cache_clear()

    try:
        settings = get_settings()
        assert settings.app_name == "Custom Release Brain"
    finally:
        get_settings.cache_clear()


def test_os_env_overrides_release_file(tmp_path, monkeypatch):
    env_file = tmp_path / "custom.release.env"
    env_file.write_text("APP_NAME=File Value\n", encoding="utf-8")
    monkeypatch.setenv("BRAIN_ENV_FILE", str(env_file))
    monkeypatch.setenv("APP_NAME", "Env Value")
    get_settings.cache_clear()

    try:
        settings = get_settings()
        assert settings.app_name == "Env Value"
    finally:
        get_settings.cache_clear()


def test_relative_sqlite_path_resolves_from_repo_root():
    settings = Settings(_env_file=None, brain_memory_sqlite_path="backend/.local/test-runtime.db")

    assert Path(settings.resolved_brain_memory_sqlite_path) == REPO_ROOT / "backend" / ".local" / "test-runtime.db"
    assert resolve_repo_path("backend/.local/test-runtime.db") == REPO_ROOT / "backend" / ".local" / "test-runtime.db"


def test_cors_origins_are_trimmed_and_deduplicated():
    settings = Settings(
        _env_file=None,
        allow_origins=" https://a.example.com,https://b.example.com,https://a.example.com ,, ",
    )

    assert settings.cors_origins == ["https://a.example.com", "https://b.example.com"]
