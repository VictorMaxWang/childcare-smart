from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_stream_agent():
    response = client.post("/api/v1/stream/agent", json={"task": "teacher-agent", "prompt": "test"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    text = response.text
    assert "event: meta" in text
    assert "event: final" in text
