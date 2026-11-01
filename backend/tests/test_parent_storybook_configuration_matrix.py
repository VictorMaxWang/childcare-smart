"""48 项真实协议配置回归：只在 HTTP 网络边界使用合成响应，不计作真实模型验收。"""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.core.config import Settings
from app.schemas.parent_storybook import ParentStoryBookRequest, ParentStoryBookResponse
from app.services import parent_storybook_service


@pytest.mark.parametrize("generation_mode", ["child-personalized", "manual-theme", "hybrid"])
@pytest.mark.parametrize("page_count", [4, 5, 6, 8])
@pytest.mark.parametrize("style", ["sunrise-watercolor", "moonlit-cutout", "forest-crayon", "custom"])
def test_storybook_all_48_configuration_contracts(monkeypatch, generation_mode, page_count, style):
    """请求校验→真实服务编排→MaaS协议/文字解析→响应校验；禁止媒体或真实网络调用。"""
    settings = Settings(ai_provider="maas", ai_api_key="synthetic-matrix-secret", ai_base_url="https://gateway.example/v1", ai_text_model="qwen3.8-flash", enable_mock_provider=False)
    monkeypatch.setattr(parent_storybook_service, "get_settings", lambda: settings)
    calls = []

    def post(_client, endpoint, **kwargs):
        assert endpoint == "https://gateway.example/v1/chat/completions"
        body = kwargs["json"]
        assert body["response_format"] == {"type": "json_object"}
        assert body["model"] == "qwen3.8-flash"
        prompt = "\n".join(message["content"] for message in body["messages"])
        assert generation_mode in prompt
        assert str(page_count) in prompt
        if style == "custom":
            assert "手绘拼贴测试画风" in prompt
        calls.append(body)
        text = {"title": "合成配置回归", "summary": "照护者陪伴共读", "moral": "温和回应", "parentNote": "合成测试内容，不作为真实模型证据。", "scenes": [
            {"sceneTitle": f"第{index + 1}页", "sceneText": f"照护者陪伴小兔观察第{index + 1}片叶子。", "audioScript": f"一起看第{index + 1}片叶子。", "imagePrompt": f"小兔和照护者观察叶子{index + 1}", "voiceStyle": "gentle", "highlightSource": "todayGrowth"}
            for index in range(page_count)
        ]}
        return httpx.Response(200, json={"id": "synthetic-matrix-request", "model": "qwen3.8-flash", "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(text, ensure_ascii=False)}}]})

    def forbidden(*_args, **_kwargs):
        raise AssertionError("configuration regression must not create paid image/audio or invoke a fallback provider")

    monkeypatch.setattr(httpx.Client, "post", post)
    monkeypatch.setattr(parent_storybook_service, "resolve_story_image_provider", forbidden)
    monkeypatch.setattr(parent_storybook_service, "resolve_story_audio_provider", forbidden)
    payload = {
        "childId": "synthetic-matrix-child", "snapshot": {"child": {"id": "synthetic-matrix-child", "name": "合成儿童", "ageBandContext": {"birthDate": "2026-02-01", "asOfDate": "2026-11-01"}}, "summary": {"growth": {"recordCount": 1}, "feedback": {"count": 0}}},
        "highlightCandidates": [{"kind": "todayGrowth", "title": "照护者陪伴", "detail": "一起观察树叶", "priority": 1}],
        "generationMode": generation_mode, "manualTheme": "温和观察树叶" if generation_mode != "child-personalized" else None,
        "pageCount": page_count, "stylePreset": style if style != "custom" else "sunrise-watercolor",
        "styleMode": "custom" if style == "custom" else "preset",
        "customStylePrompt": "手绘拼贴测试画风" if style == "custom" else "", "customStyleNegativePrompt": "不要文字与水印" if style == "custom" else "",
        "requestSource": "pytest-configuration-matrix",
    }
    request = ParentStoryBookRequest.model_validate(payload)
    result = asyncio.run(parent_storybook_service.run_parent_storybook(request.model_dump(mode="json", by_alias=True, exclude_none=True)))
    wire = ParentStoryBookResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    assert len(calls) == 1
    assert wire["childId"] == payload["childId"]
    assert len(wire["scenes"]) == wire["providerMeta"]["sceneCount"] == page_count
    assert wire["stylePreset"] == payload["stylePreset"]
    assert wire["providerMeta"]["diagnostics"]["text"]["model"] == "qwen3.8-flash"
    assert [scene["sceneIndex"] for scene in wire["scenes"]] == list(range(1, page_count + 1))
    assert all(scene["imageStatus"] == scene["audioStatus"] == "empty" for scene in wire["scenes"])
    assert all(scene["imageUrl"] is None and scene["audioUrl"] is None for scene in wire["scenes"])
    assert all(scene["audioScript"] and scene["captionTiming"] for scene in wire["scenes"])
    assert all(scene["sceneText"] in scene["imagePrompt"] for scene in wire["scenes"])
    if style == "custom":
        assert all("手绘拼贴测试画风" in scene["imagePrompt"] for scene in wire["scenes"])
