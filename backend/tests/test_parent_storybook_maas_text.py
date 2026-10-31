"""绘本同步文字入口需与其余 MaaS JSON 业务保持协议一致，拒绝不能自动重发。"""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest

from app.core.config import Settings
from app.services.parent_storybook_llm import ParentStoryBookTextProviderError, generate_parent_storybook_text, _storybook_age_constraint
from app.services.parent_storybook_llm import ParentStoryBookTextGeneration
from app.services import parent_storybook_service
from app.schemas.parent_storybook import ParentStoryBookResponse


def story_inputs() -> dict:
    return {
        "settings": Settings(ai_provider="maas", ai_api_key="synthetic-secret", ai_base_url="https://gateway.example/v1", enable_mock_provider=False),
        "payload": {"snapshot": {"child": {"name": "合成儿童"}}},
        "ingredients": {"story_mode": "storybook", "page_count": 4, "focus_theme": "晚安",
            "generation_mode": "manual-theme", "goal_keywords": ["安心入睡"], "style_prompt": "水彩",
            "protagonist": {"label": "小兔"}, "highlights": []},
        "rule_story": {"title": "今晚的小故事", "summary": "晚安", "moral": "安心入睡", "parentNote": "一起听故事",
            "scenes": [{"sceneTitle": f"第{index+1}页", "sceneText": "小兔收好玩具。", "audioScript": "小兔收好玩具。",
                "imagePrompt": "水彩小兔", "voiceStyle": "gentle-bedtime", "highlightSource": "family-context"} for index in range(4)]},
    }


def test_storybook_age_constraint_uses_authorized_infant_age_and_unknown_age_is_conservative():
    text = _storybook_age_constraint({"ageBandContext": {"birthDate": "2026-02-10", "asOfDate": "2026-10-31"}})
    assert "8个月" in text and "不得要求独立行走" in text and "照护者陪伴共读" in text
    assert "3-6" not in text
    unknown = _storybook_age_constraint({})
    assert "月龄尚未核实" in unknown and "不编造年龄或发展能力" in unknown


def test_brain_returns_real_maas_text_and_pending_media_without_invoking_mock_media(monkeypatch):
    settings = story_inputs()["settings"]
    monkeypatch.setattr(parent_storybook_service, "get_settings", lambda: settings)
    calls = []

    def generated(**kwargs):
        calls.append(kwargs)
        rule = kwargs["rule_story"]
        return ParentStoryBookTextGeneration(title=rule["title"], summary=rule["summary"], moral=rule["moral"],
            parent_note=rule["parentNote"], scenes=rule["scenes"], source="ai", provider="maas-llm", model="qwen3.8-flash",
            text_delivery="real", real_provider=True, fallback=False, fallback_reason=None, elapsed_ms=120, request_id="synthetic-request")

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Brain MaaS text must not generate mock images, audio, or paid media")

    monkeypatch.setattr(parent_storybook_service, "generate_parent_storybook_text", generated)
    monkeypatch.setattr(parent_storybook_service, "resolve_story_image_provider", forbidden)
    monkeypatch.setattr(parent_storybook_service, "resolve_story_audio_provider", forbidden)
    payload = {"snapshot": {"child": {"id": "synthetic-child", "name": "合成儿童", "ageBandContext": {"birthDate": "2026-02-10", "asOfDate": "2026-10-31"}},
        "summary": {"growth": {"recordCount": 2}, "feedback": {"count": 1}}},
        "highlightCandidates": [{"kind": "todayGrowth", "title": "照护者陪伴", "detail": "照护者陪伴观察软布球", "priority": 1}],
        "pageCount": 4, "generationMode": "child-personalized"}
    before = datetime.now(UTC)
    result = asyncio.run(parent_storybook_service.run_parent_storybook(payload))
    after = datetime.now(UTC)
    wire = ParentStoryBookResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    assert len(calls) == 1 and wire["source"] == "ai" and wire["fallback"] is False
    assert wire["providerMeta"]["provider"] == "maas" and wire["providerMeta"]["textProvider"] == "maas"
    assert wire["providerMeta"]["textDelivery"] == "real" and wire["providerMeta"]["realProvider"] is True
    assert wire["providerMeta"]["diagnostics"]["text"]["model"] == "qwen3.8-flash", "use actual returned model, not configured GLM"
    assert wire["providerMeta"]["diagnostics"]["text"]["requestId"] == "synthetic-request"
    assert before <= datetime.fromisoformat(wire["generatedAt"].replace("Z", "+00:00")) <= after
    assert calls[0]["payload"]["snapshot"]["child"]["ageBandContext"]["birthDate"] == "2026-02-10"
    for channel in ("image", "audio"):
        assert wire["providerMeta"]["diagnostics"][channel]["pendingSceneCount"] == 4
        assert wire["providerMeta"]["diagnostics"][channel]["readySceneCount"] == 0
    assert all(scene["imageStatus"] == "empty" and scene["audioStatus"] == "empty" and not scene["imageUrl"] and not scene["audioUrl"] for scene in wire["scenes"])


def test_storybook_sync_maas_uses_json_mode_and_configured_model(monkeypatch):
    inputs = story_inputs()
    calls = []

    def post(_client, endpoint, **kwargs):
        calls.append((endpoint, kwargs["json"]))
        return httpx.Response(200, json={"id": "synthetic-story-request", "model": "ZHIPU/GLM-5.3-Flash",
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(inputs["rule_story"], ensure_ascii=False)}}]})

    monkeypatch.setattr(httpx.Client, "post", post)
    result = generate_parent_storybook_text(**inputs)
    assert len(calls) == 1 and calls[0][0] == "https://gateway.example/v1/chat/completions"
    assert calls[0][1]["response_format"] == {"type": "json_object"}
    assert calls[0][1]["model"] == "ZHIPU/GLM-5.3-Flash"
    assert "enable_thinking" not in calls[0][1]
    assert result.real_provider and not result.fallback and result.source == "ai"
    assert result.provider == "maas-llm" and len(result.scenes) == 4
    assert result.request_id == "synthetic-story-request"


def test_storybook_explicit_upstream_rejection_retains_safe_diagnosis_without_retry(monkeypatch, caplog):
    calls = []

    def post(*_args, **_kwargs):
        calls.append(1)
        return httpx.Response(400, json={"error": {"code": "InvalidParameter", "message": "private-child-text"}})

    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(ParentStoryBookTextProviderError) as raised:
        generate_parent_storybook_text(**story_inputs())
    assert len(calls) == 1
    assert raised.value.status_code == 400 and raised.value.fallback_reason == "upstream-invalid-request"
    assert raised.value.__cause__.error_code == "InvalidParameter"
    assert "private-child-text" not in str(raised.value) and "private-child-text" not in caplog.text
    assert "synthetic-secret" not in caplog.text


def test_storybook_product_activation_rejection_is_not_reported_as_invalid_story_json(monkeypatch, caplog):
    calls = []

    def post(*_args, **_kwargs):
        calls.append(1)
        return httpx.Response(400, json={"error": {"code": "invalid_parameter_error",
            "message": "The product is not activated, please confirm that you have activated products and try again after activation."}})

    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(ParentStoryBookTextProviderError) as raised:
        generate_parent_storybook_text(**story_inputs())
    assert len(calls) == 1 and raised.value.status_code == 400
    assert raised.value.fallback_reason == "upstream-model-not-activated"
    assert "upstream-model-not-activated" in caplog.text and "please confirm" not in caplog.text
