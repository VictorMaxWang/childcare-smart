import asyncio

import pytest
from pydantic import SecretStr

import app.services.parent_message_reflexion as parent_message_module
from app.core.config import Settings
from app.providers.base import ProviderTextResult
from app.schemas.parent_message import ParentMessageReflexionRequest
from app.services.evaluator_optimizer import EvaluationStepResult, GeneratorStepResult
from app.services.parent_message_reflexion import ParentMessageReflexionService


def build_payload() -> dict:
    return {
        "targetChildId": "child-1",
        "teacherNote": "今天入园时有点黏老师，午睡前需要更多安抚。",
        "issueSummary": "入园分离时情绪波动，午睡前需要更多陪伴。",
        "currentInterventionCard": {
            "summary": "先降低沟通压力，再观察今晚情绪和入睡情况。",
            "tonightHomeAction": "睡前先保持固定节奏，再观察孩子安静下来需要多久。",
            "reviewIn48h": "请在明早入园前反馈，48 小时内一起复盘。",
        },
        "visibleChildren": [{"id": "child-1", "name": "安安"}],
        "debugLoop": True,
    }


def build_live_settings() -> Settings:
    return Settings(
        brain_provider="vivo",
        enable_mock_provider=False,
        vivo_app_id="app-id",
        vivo_app_key=SecretStr("app-key"),
        vivo_llm_model="Volc-DeepSeek-V3.2",
    )


def build_live_context(service: ParentMessageReflexionService):
    payload = build_payload()
    request = ParentMessageReflexionRequest.model_validate(payload)
    return service._build_context(request, payload)


class FakeTextProvider:
    def __init__(self, result: ProviderTextResult):
        self.result = result

    def summarize(self, prompt: str, fallback: str) -> ProviderTextResult:
        return self.result


def test_parent_message_reflexion_passes_on_first_iteration():
    service = ParentMessageReflexionService()

    result = asyncio.run(service.run(build_payload()))
    body = result.model_dump(mode="json", by_alias=True)

    assert body["evaluationMeta"]["stopReason"] == "passed"
    assert body["evaluationMeta"]["canSend"] is True
    assert body["revisionCount"] == 0
    assert body["finalOutput"]["title"]
    assert body["finalOutput"]["tonightActions"]
    assert body["source"] == "mock"
    assert body["fallback"] is False


def test_parent_message_reflexion_retries_once_then_passes(monkeypatch):
    service = ParentMessageReflexionService()
    call_count = {"value": 0}

    async def fake_evaluate_candidate(draft, context, iteration):
        call_count["value"] += 1
        if call_count["value"] == 1:
            return EvaluationStepResult(
                score=6.5,
                problems=["语气还可以更温和。"],
                revision_suggestions=["把开头改得更低焦虑一点。"],
                can_send=False,
                retryable=True,
                decision="revise",
                fallback=False,
                provider="local-rule",
                model="local-rule-v1",
            )
        return EvaluationStepResult(
            score=8.8,
            problems=[],
            revision_suggestions=[],
            can_send=True,
            retryable=True,
            decision="approve",
            fallback=False,
            provider="local-rule",
            model="local-rule-v1",
        )

    monkeypatch.setattr(service, "_evaluate_candidate", fake_evaluate_candidate)

    result = asyncio.run(service.run(build_payload()))
    body = result.model_dump(mode="json", by_alias=True)

    assert body["evaluationMeta"]["stopReason"] == "passed"
    assert body["evaluationMeta"]["approvedIteration"] == 2
    assert body["revisionCount"] == 1
    assert body["evaluationMeta"]["iterationScores"] == [6.5, 8.8]


def test_parent_message_reflexion_returns_best_draft_after_max_iterations(monkeypatch):
    service = ParentMessageReflexionService()
    payload = build_payload()
    payload["debugLoop"] = False

    async def fake_generate_candidate(context, revision_instructions, iteration):
        draft = {
            "title": f"{context.child_name} 今晚沟通建议 {iteration}",
            "summary": f"第 {iteration} 轮摘要",
            "tonight_actions": [f"动作 {iteration}"],
            "wording_for_parent": f"第 {iteration} 轮发给家长的话术。",
            "why_this_matters": "这样能帮助老师继续观察。",
            "estimated_time": "5-10 分钟",
            "follow_up_window": context.follow_up_window,
        }
        return GeneratorStepResult(
            draft=draft,
            source="mock",
            model="local-parent-message-v1",
            provider="local-generator",
            fallback=False,
        )

    async def fake_evaluate_candidate(draft, context, iteration):
        return EvaluationStepResult(
            score=7.0 + (iteration * 0.1),
            problems=[f"问题 {iteration}"],
            revision_suggestions=[f"建议 {iteration}"],
            can_send=False,
            retryable=True,
            decision="revise",
            fallback=False,
            provider="local-rule",
            model="local-rule-v1",
        )

    monkeypatch.setattr(service, "_generate_candidate", fake_generate_candidate)
    monkeypatch.setattr(service, "_evaluate_candidate", fake_evaluate_candidate)

    result = asyncio.run(service.run(payload))
    body = result.model_dump(mode="json", by_alias=True)

    assert body["evaluationMeta"]["stopReason"] == "max_iterations"
    assert body["evaluationMeta"]["canSend"] is False
    assert body["revisionCount"] == 2
    assert body["finalOutput"]["summary"] == "第 3 轮摘要"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('```json\n{"title":"ok"}\n```', {"title": "ok"}),
        ('{"title":"ok"}\nNote: use {care}.', {"title": "ok"}),
        ('结果是 "{\\"title\\":\\"ok\\",\\"score\\":8}"', {"title": "ok", "score": 8}),
    ],
)
def test_extract_json_object_recovers_wrapped_provider_payloads(raw, expected):
    assert ParentMessageReflexionService._extract_json_object(raw) == expected


def test_generate_candidate_rejects_extra_fields_and_marks_schema_fallback(monkeypatch):
    service = ParentMessageReflexionService(settings=build_live_settings())
    context = build_live_context(service)
    provider_result = ProviderTextResult(
        text=(
            '{"title":"安安 今晚沟通建议","summary":"先做一个稳定动作。","tonight_actions":["先抱一抱"],'
            '"wording_for_parent":"今晚先抱一抱孩子。","why_this_matters":"这样更容易闭环。",'
            '"estimated_time":"5-10 分钟","follow_up_window":"明早入园前反馈","unexpected":"extra"}'
        ),
        source="vivo",
        model="Volc-DeepSeek-V3.2",
        provider="vivo-llm",
        fallback=False,
        request_id="req-gen-1",
    )
    monkeypatch.setattr(parent_message_module, "resolve_text_provider", lambda settings: FakeTextProvider(provider_result))

    result = asyncio.run(service._generate_candidate(context, None, 1))

    assert result.fallback is True
    assert result.stop_reason == "generator_fallback"
    assert result.source == "mock"
    assert result.debug_meta["fallback_reason"] == "json-schema-mismatch"
    assert result.debug_meta["provider_request_id"] == "req-gen-1"
    assert result.draft["title"]


def test_call_live_evaluator_uses_schema_validation_and_explicit_boolean_parsing(monkeypatch):
    service = ParentMessageReflexionService(settings=build_live_settings())
    context = build_live_context(service)
    draft = service._build_local_draft(context, None, 1).model_dump(mode="json")
    provider_result = ProviderTextResult(
        text=(
            '评审结果："{\\"score\\":\\"8.9\\",\\"problems\\":\\"语气略硬\\",'
            '\\"revision_suggestions\\":\\"再柔和一点\\",\\"can_send\\":\\"false\\",'
            '\\"retryable\\":\\"0\\",\\"decision\\":\\"block\\"}"'
        ),
        source="vivo",
        model="Volc-DeepSeek-V3.2",
        provider="vivo-llm",
        fallback=False,
        request_id="req-eval-1",
    )
    monkeypatch.setattr(parent_message_module, "resolve_text_provider", lambda settings: FakeTextProvider(provider_result))

    result = asyncio.run(service._call_live_evaluator(draft, context, 1))

    assert result.fallback is False
    assert result.score == 8.9
    assert result.can_send is False
    assert result.retryable is False
    assert result.decision == "block"
    assert result.problems == ["语气略硬"]
    assert result.revision_suggestions == ["再柔和一点"]


def test_parent_message_reflexion_surfaces_generator_fallback_reason_in_final_problems(monkeypatch):
    service = ParentMessageReflexionService()

    async def fake_generate_candidate(context, revision_instructions, iteration):
        local_draft = service._build_local_draft(context, revision_instructions, iteration).model_dump(mode="json")
        return GeneratorStepResult(
            draft=local_draft,
            source="mock",
            model="local-parent-message-v1",
            provider="local-generator",
            fallback=True,
            stop_reason="generator_fallback",
            debug_meta={"fallback_reason": "json-schema-mismatch"},
        )

    async def fake_evaluate_candidate(draft, context, iteration):
        return EvaluationStepResult(
            score=8.4,
            problems=[],
            revision_suggestions=[],
            can_send=True,
            retryable=True,
            decision="approve",
            fallback=False,
            provider="local-rule",
            model="local-rule-v1",
        )

    monkeypatch.setattr(service, "_generate_candidate", fake_generate_candidate)
    monkeypatch.setattr(service, "_evaluate_candidate", fake_evaluate_candidate)

    result = asyncio.run(service.run(build_payload()))
    body = result.model_dump(mode="json", by_alias=True)

    assert body["fallback"] is True
    assert body["evaluationMeta"]["stopReason"] == "passed"
    assert any("生成阶段已回退为本地兜底" in item for item in body["evaluationMeta"]["problems"])
