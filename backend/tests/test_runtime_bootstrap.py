from __future__ import annotations

import importlib

from fastapi.testclient import TestClient

from app.main import create_app


def test_backend_asgi_import_path_exports_app():
    module = importlib.import_module("backend.asgi")

    assert module.app is not None
    assert callable(module.create_app)


def test_unhandled_non_streaming_errors_return_json_500():
    app = create_app()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json()["error"] == "Internal server error"
    assert response.json()["details"].startswith("request_id=")
    assert response.headers["x-request-id"]
