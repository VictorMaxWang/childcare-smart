from __future__ import annotations

import asyncio
import json
import logging

import httpx
import pytest

from app.agents.parent_agent import run_parent_follow_up, run_parent_suggestions
from app.agents.weekly_report import run_weekly_report
from app.core.config import Settings
from app.providers.base import ProviderResponseError
from app.services import structured_text


@pytest.fixture
def live_provider(monkeypatch):
    settings = Settings(ai_provider="maas", ai_api_key="test-only-secret", ai_base_url="https://gateway.example/v1")
    monkeypatch.setattr(structured_text, "get_settings", lambda: settings)

    def answer(output):
        captured = []
        async def post(_client, _url, **kwargs):
            captured.append(kwargs["json"])
            return httpx.Response(200, json={"id": "test-request", "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(output, ensure_ascii=False)}}]})
        monkeypatch.setattr(httpx.AsyncClient, "post", post)
        return captured
    return answer


def test_parent_suggestion_uses_real_text_and_excludes_scope(live_provider):
    captured = live_provider({"riskLevel": "low", "summary": "近期仅有一条合成饮食记录，缺少睡眠记录。", "highlights": ["已记录进餐"], "concerns": ["缺少睡眠记录"], "actions": ["今晚补充入睡观察"], "actionPlan": {"schoolActions": ["明早补充晨检"], "familyActions": ["今晚记录入睡"], "reviewActions": ["48小时后共同回看"]}, "trendPrediction": "stable"})
    result = asyncio.run(run_parent_suggestions({"snapshot": {"recentMeals": [{"food": "合成米粥"}]}, "serviceScope": {"token": "private-scope-token"}}))
    assert result["source"] == "ai" and result["provider"] == "maas-llm" and not result["fallback"]
    assert "private-scope-token" not in json.dumps(captured)
    assert result["providerTrace"]["requestId"] == "test-request"
    assert captured[0]["response_format"] == {"type": "json_object"}


def test_weekly_report_preserves_role_contract(live_provider):
    live_provider({"summary": "合成记录较少，应补充连续观察。", "highlights": ["已有饮食观察"], "risks": ["缺少睡眠记录"], "nextWeekActions": ["下周一补充睡眠情况并回传"], "trendPrediction": "stable"})
    result = asyncio.run(run_weekly_report({"role": "parent", "snapshot": {"overview": {"mealRecordCount": 1}}}))
    assert result["source"] == "ai" and result["schemaVersion"] == "v2-actionized"
    assert result["primaryAction"]["ownerRole"] == "parent"
    assert [item["id"] for item in result["sections"]] == ["weeklyChanges", "topHomeAction", "feedbackNeeded"]


def test_invalid_fields_fail_without_second_request(live_provider):
    captured = live_provider({"answer": "文字", "keyPoints": "not-an-array"})
    with pytest.raises(ProviderResponseError):
        asyncio.run(run_parent_follow_up({"question": "今晚如何做？"}))
    assert len(captured) == 1


def suggestion_output():
    return {"riskLevel": "low", "summary": "合成记录缺少睡眠观察。", "highlights": ["已有合成进餐记录"],
        "concerns": ["需补充睡眠观察"], "actions": ["今晚记录入睡情况"],
        "actionPlan": {"schoolActions": ["明早留意精神状态"], "familyActions": ["记录入睡情况"], "reviewActions": ["48小时后回看"]},
        "trendPrediction": "stable"}


@pytest.mark.parametrize("risk,trend,expected_risk,expected_trend", [
    (" MEDIUM ", "STABLE", "medium", "stable"),
    ("中等风险", "平稳", "medium", "stable"),
    ("低风险", "上升趋势", "low", "up"),
])
def test_structured_enum_normalization_only_accepts_equivalent_values(live_provider, risk, trend, expected_risk, expected_trend):
    output = {**suggestion_output(), "riskLevel": risk, "trendPrediction": trend}
    captured = live_provider(output)
    result = asyncio.run(run_parent_suggestions({"snapshot": {"synthetic": True}}))
    assert result["riskLevel"] == expected_risk and result["trendPrediction"] == expected_trend
    assert len(captured) == 1 and captured[0]["response_format"] == {"type": "json_object"}


def test_invalid_enum_is_not_defaulted_or_retried_and_logs_no_original_value(live_provider, caplog):
    caplog.set_level(logging.WARNING, logger="app.services.structured_text")
    captured = live_provider({**suggestion_output(), "riskLevel": "unknown-private-child-enum"})
    with pytest.raises(ProviderResponseError, match="invalid-enum"):
        asyncio.run(run_parent_suggestions({"snapshot": {"private": "private-child-record"}}))
    assert len(captured) == 1
    messages = [record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.structured_validation ")]
    assert len(messages) == 1
    assert json.loads(messages[0].removeprefix("ai.structured_validation ")) == {"category": "invalid-enum", "fields": ["riskLevel"]}
    assert "private" not in messages[0]


def test_invalid_nested_structure_logs_only_the_expected_field_path(live_provider, caplog):
    caplog.set_level(logging.WARNING, logger="app.services.structured_text")
    output = suggestion_output()
    output["actionPlan"]["familyActions"] = "private-child-text"
    captured = live_provider(output)
    with pytest.raises(ProviderResponseError, match="invalid-text-list"):
        asyncio.run(run_parent_suggestions({"snapshot": {"synthetic": True}}))
    assert len(captured) == 1
    message = next(record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.structured_validation "))
    assert json.loads(message.removeprefix("ai.structured_validation ")) == {"category": "invalid-text-list", "fields": ["actionPlan.familyActions"]}
    assert "private-child-text" not in message
