from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import install_error_handlers
from app.providers.base import ProviderAuthenticationError


def test_provider_errors_are_explicit_and_redacted():
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/synthetic")
    async def synthetic():
        raise ProviderAuthenticationError("test-secret private-child-input")

    response = TestClient(app).get("/synthetic")
    assert response.status_code == 503
    assert response.json()["code"] == "provider_unavailable"
    assert "test-secret" not in response.text and "private-child-input" not in response.text
