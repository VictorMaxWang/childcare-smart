from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.teacher_voice import router as teacher_voice_router
from app.providers.base import AsrProviderInput, AsrSegment, AsrTranscription, ProviderResult
import app.services.teacher_voice_understand as teacher_voice_understand


app = FastAPI()
app.include_router(teacher_voice_router, prefix="/api/v1")
client = TestClient(app)


class StubAsrProvider:
    def __init__(self, result: ProviderResult[AsrTranscription]):
        self.result = result
        self.last_input: AsrProviderInput | None = None

    def transcribe(self, input: AsrProviderInput) -> ProviderResult[AsrTranscription]:
        self.last_input = input
        return self.result


def test_teacher_voice_understand_transcript_only():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "小明今天体温37.6度，需要继续观察。",
            "childId": "c1",
            "childName": "小明",
            "scene": "teacher-global-fab",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"]["source"] == "provided_transcript"
    assert body["router_result"]["primary_category"] == "HEALTH"
    assert body["draft_items"][0]["category"] == "HEALTH"
    assert body["draft_items"][0]["child_ref"] == "c1"
    assert isinstance(body["record_completion_hints"], list)
    assert isinstance(body["micro_training_sop"], list)
    assert isinstance(body["parent_communication_script"], dict)
    assert "generated_at" in body
    assert body["source"]["router"] == "rule"


def test_teacher_voice_understand_multipart_passes_through_real_vivo_provider(monkeypatch):
    stub_provider = StubAsrProvider(
        ProviderResult(
            provider="vivo-asr",
            mode="real",
            source="vivo",
            model="fileasrrecorder",
            request_id="req-asr-123",
            output=AsrTranscription(
                transcript="小明今天体温37.6度，需要继续观察。",
                confidence=None,
                segments=[AsrSegment(text="小明今天体温37.6度，需要继续观察。", start_ms=0, end_ms=1200)],
                meta={"transport": "vivo-lasr-http", "task_id": "task-1"},
                raw={"transport": "vivo-lasr-http", "stages": {"result": {"sid": "sid-result"}}},
                fallback=False,
            ),
        )
    )
    monkeypatch.setattr(teacher_voice_understand, "resolve_asr_provider", lambda *args, **kwargs: stub_provider)

    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        files={"audio": ("voice.wav", b"real-audio-bytes", "audio/wav")},
        data={
            "childId": "c1",
            "childName": "小明",
            "scene": "teacher-global-fab",
            "durationMs": "1200",
        },
    )

    assert response.status_code == 200
    assert stub_provider.last_input is not None
    assert stub_provider.last_input.audio_bytes == b"real-audio-bytes"
    assert stub_provider.last_input.attachment_name == "voice.wav"
    assert stub_provider.last_input.mime_type == "audio/wav"
    assert stub_provider.last_input.duration_ms == 1200

    body = response.json()
    assert body["transcript"]["text"] == "小明今天体温37.6度，需要继续观察。"
    assert body["transcript"]["source"] == "vivo"
    assert body["transcript"]["provider"] == "vivo-asr"
    assert body["transcript"]["mode"] == "real"
    assert body["transcript"]["fallback"] is False
    assert body["transcript"]["raw"]["transport"] == "vivo-lasr-http"
    assert body["meta"]["asr"]["provider"] == "vivo-asr"
    assert body["meta"]["asr"]["mode"] == "real"
    assert body["meta"]["asr"]["raw"]["transport"] == "vivo-lasr-http"
    assert body["trace"]["input_mode"] == "multipart"
    assert body["trace"]["fallback"] is False


def test_teacher_voice_understand_multipart_passes_through_fallback_provider(monkeypatch):
    stub_provider = StubAsrProvider(
        ProviderResult(
            provider="vivo-asr",
            mode="mock",
            source="mock",
            model="fileasrrecorder",
            request_id="req-asr-fallback",
            output=AsrTranscription(
                transcript="voice.wav 转写结果：小朋友今天午睡前情绪波动。",
                confidence=0.62,
                meta={"reason": "timeout", "stage": "create", "transport": "vivo-lasr-http"},
                raw={"path": "vivo-asr-fallback", "stage": "create"},
                fallback=True,
            ),
        )
    )
    monkeypatch.setattr(teacher_voice_understand, "resolve_asr_provider", lambda *args, **kwargs: stub_provider)

    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        files={"audio": ("voice.wav", b"fallback-audio-bytes", "audio/wav")},
        data={
            "childId": "c1",
            "childName": "小明",
            "scene": "teacher-global-fab",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"]["source"] == "mock"
    assert body["transcript"]["provider"] == "vivo-asr"
    assert body["transcript"]["mode"] == "mock"
    assert body["transcript"]["fallback"] is True
    assert body["meta"]["asr"]["provider"] == "vivo-asr"
    assert body["meta"]["asr"]["mode"] == "mock"
    assert body["meta"]["asr"]["meta"]["reason"] == "timeout"
    assert body["meta"]["asr"]["raw"]["stage"] == "create"
    assert body["trace"]["input_mode"] == "multipart"
    assert body["trace"]["fallback"] is True


def test_teacher_voice_understand_mixed_transcript_splits_tasks_and_draft_items():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "小明今天午睡前哭闹。体温37.6度，需要继续观察。下午请假回家。",
            "childId": "c1",
            "childName": "小明",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["router_result"]["primary_category"] == "MIXED"
    assert body["router_result"]["is_multi_event"] is True
    categories = [item["category"] for item in body["draft_items"]]
    assert "EMOTION" in categories
    assert "HEALTH" in categories
    assert "LEAVE" in categories


def test_teacher_voice_understand_bad_request_returns_400():
    response = client.post("/api/v1/agents/teacher/voice-understand", json={"childId": "c1"})
    assert response.status_code == 400


def test_teacher_voice_understand_low_confidence_adds_record_completion_hints(monkeypatch):
    stub_provider = StubAsrProvider(
        ProviderResult(
            provider="vivo-asr",
            mode="mock",
            source="mock",
            model="fileasrrecorder",
            request_id="req-asr-low-confidence",
            output=AsrTranscription(
                transcript="\u5c0f\u660e\u4eca\u5929\u6709\u70b9\u4e0d\u8212\u670d",
                confidence=0.52,
                meta={"reason": "low-confidence"},
                raw={"path": "vivo-asr-fallback"},
                fallback=True,
            ),
        )
    )
    monkeypatch.setattr(teacher_voice_understand, "resolve_asr_provider", lambda *args, **kwargs: stub_provider)

    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "childId": "c1",
            "childName": "\u5c0f\u660e",
            "scene": "teacher-global-fab",
            "fallbackText": "\u5c0f\u660e\u4eca\u5929\u6709\u70b9\u4e0d\u8212\u670d",
        },
    )

    assert response.status_code == 200
    body = response.json()
    labels = [item["label"] for item in body["record_completion_hints"]]
    assert "\u8bf7\u518d\u8865\u4e00\u53e5\u66f4\u6e05\u6670\u7684\u4e8b\u4ef6\u63cf\u8ff0" in labels
    assert "\u521d\u6b65\u89c2\u5bdf" in body["parent_communication_script"]["calm_explanation"]


def test_teacher_voice_understand_sleep_generates_micro_training_sop():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "\u5c0f\u660e\u4eca\u5929\u5348\u7761\u53ea\u776120\u5206\u949f\u5c31\u60ca\u9192\u4e86",
            "childId": "c1",
            "childName": "\u5c0f\u660e",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["micro_training_sop"][0]["scenario_tag"] == "sleep"
    assert body["micro_training_sop"][0]["duration_text"] == "\u7ea630\u79d2"


def test_teacher_voice_understand_diet_generates_micro_training_sop():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "\u5c0f\u660e\u4eca\u5929\u5348\u996d\u5403\u5f97\u5c11\uff0c\u559d\u6c34\u4e5f\u504f\u5c11",
            "childId": "c1",
            "childName": "\u5c0f\u660e",
        },
    )

    assert response.status_code == 200
    body = response.json()
    scenario_tags = [item["scenario_tag"] for item in body["micro_training_sop"]]
    assert "diet" in scenario_tags


def test_teacher_voice_understand_separation_anxiety_generates_specific_sop():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "\u5c0f\u660e\u4eca\u5929\u5165\u56ed\u5206\u79bb\u65f6\u54ed\u95f9\uff0c\u5b89\u629a\u540e\u624d\u7f13\u4e0b\u6765",
            "childId": "c1",
            "childName": "\u5c0f\u660e",
        },
    )

    assert response.status_code == 200
    body = response.json()
    scenario_tags = [item["scenario_tag"] for item in body["micro_training_sop"]]
    assert "separation_anxiety" in scenario_tags


def test_teacher_voice_understand_leave_generates_parent_communication_script():
    response = client.post(
        "/api/v1/agents/teacher/voice-understand",
        json={
            "transcript": "\u5c0f\u660e\u4e0b\u5348\u56e0\u4e3a\u54b3\u55fd\u63d0\u524d\u79bb\u56ed\uff0c\u5bb6\u957f\u8868\u793a\u4eca\u665a\u4f1a\u5728\u5bb6\u89c2\u5bdf\uff0c\u660e\u65e9\u518d\u53cd\u9988\u662f\u5426\u8fd4\u56ed",
            "childId": "c1",
            "childName": "\u5c0f\u660e",
        },
    )

    assert response.status_code == 200
    body = response.json()
    script = body["parent_communication_script"]
    assert script["short_message"]
    assert "\u4eca\u665a" in script["follow_up_reminder"]
    assert "\u660e\u65e9" in script["follow_up_reminder"]
