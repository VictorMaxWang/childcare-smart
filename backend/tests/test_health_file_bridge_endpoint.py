from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_file_bridge_endpoint_accepts_camel_case_payload():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "childId": "child-1",
            "sourceRole": "teacher",
            "files": [
                {
                    "fileId": "file-1",
                    "name": "outside-note.pdf",
                    "mimeType": "application/pdf",
                    "previewText": "发热 37.8，明早复查",
                }
            ],
            "fileKind": "health-note",
            "requestSource": "pytest-endpoint",
            "optionalNotes": "到园先复测体温。",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "backend-text-fallback"
    assert body["mock"] is True
    assert body["liveReadyButNotVerified"] is True
    assert body["fileType"] in {"pdf", "mixed"}
    assert body["contraindications"] is not None
    assert body["followUpHints"]
    assert body["actionMapping"]["schoolTodayActions"]
    assert body["actionMapping"]["familyTonightActions"]
    assert "escalationSuggestion" in body["actionMapping"]
    assert isinstance(body["confidence"], float)


def test_health_file_bridge_endpoint_accepts_snake_case_payload():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "child_id": "child-2",
            "source_role": "parent",
            "files": [
                {
                    "file_id": "file-2",
                    "name": "prescription.png",
                    "mime_type": "image/png",
                    "preview_text": "有过敏史，继续雾化用药",
                }
            ],
            "file_kind": "prescription",
            "request_source": "pytest-endpoint",
            "optional_notes": "家长今晚会补充药物说明。",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["childId"] == "child-2"
    assert body["sourceRole"] == "parent"
    assert body["riskItems"]
    assert body["contraindications"]
    assert body["followUpHints"]
    assert body["actionMapping"]["schoolTodayActions"]
    assert body["actionMapping"]["familyTonightActions"]
    assert body["actionMapping"]["followUpPlan"]


def test_health_file_bridge_endpoint_rejects_empty_files():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "sourceRole": "teacher",
            "files": [],
            "requestSource": "pytest-endpoint",
        },
    )

    assert response.status_code == 422


def test_health_file_bridge_endpoint_rejects_invalid_source_role():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "sourceRole": "doctor",
            "files": [{"name": "outside-note.pdf"}],
            "requestSource": "pytest-endpoint",
        },
    )

    assert response.status_code == 422
