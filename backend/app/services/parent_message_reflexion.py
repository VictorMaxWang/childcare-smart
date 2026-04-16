from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from app.core.config import Settings, get_settings
from pydantic import ValidationError

from app.providers.base import ProviderAuthenticationError, ProviderResponseError, ProviderTextResult
from app.providers.resolver import can_use_vivo_text_provider, resolve_text_provider
from app.schemas.parent_message import (
    ParentMessageDebugIteration,
    ParentMessageDraftOutput,
    ParentMessageEvaluationMeta,
    ParentMessageFinalOutput,
    ParentMessageProviderDraftOutput,
    ParentMessageProviderEvaluatorOutput,
    ParentMessageReflexionRequest,
    ParentMessageReflexionResponse,
)
from app.services.evaluator_optimizer import (
    EvaluationStepResult,
    EvaluatorOptimizer,
    GeneratorStepResult,
    OptimizerIteration,
    OptimizerRunResult,
)
from app.services.memory_service import MemoryService
from app.tools.summary_tools import first_non_empty, safe_dict, safe_list, unique_texts


logger = logging.getLogger(__name__)

ANXIETY_KEYWORDS = ("必须", "严重", "危险", "恶化", "立刻", "尽快处理", "问题越来越", "不能再")
BLAME_KEYWORDS = ("家长没有", "你们需要", "请家长务必", "配合不到位", "没有做到", "不应该")
SOFTENERS = ("建议", "可以", "辛苦您", "方便的话", "一起", "先", "留意", "观察")
CHILDCARE_SCENE_KEYWORDS = ("今晚", "明早", "老师", "入园", "观察", "孩子", "家庭", "反馈")


@dataclass
class ParentMessageContext:
    child_id: str | None
    child_name: str
    teacher_note: str
    issue_summary: str
    current_intervention_card: dict[str, Any]
    latest_guardian_feedback: dict[str, Any]
    today_in_school_actions: list[str]
    tonight_home_actions: list[str]
    continuity_notes: list[str]
    follow_up_window: str
    estimated_time: str
    session_id: str | None
    trace_id: str | None
    debug_memory: bool
    debug_loop: bool
    memory_context_used: bool
    memory_meta: dict[str, Any] | None
    live_provider_enabled: bool


class ParentMessageReflexionService:
    def __init__(self, *, settings: Settings | None = None, memory: MemoryService | None = None) -> None:
        self.settings = settings or get_settings()
        self.memory = memory
        self.optimizer = EvaluatorOptimizer()

    async def run(self, payload: dict[str, Any]) -> ParentMessageReflexionResponse:
        request = ParentMessageReflexionRequest.model_validate(payload)
        context = self._build_context(request, payload)
        max_candidates = 4 if request.debug_loop else 3
        reflexion_records: list[tuple[int, str, list[str], list[str]]] = []

        async def generate(revision_instructions: str | None, iteration: int) -> GeneratorStepResult:
            started_at = perf_counter()
            result = await self._generate_candidate(context, revision_instructions, iteration)
            await self._save_phase_trace(
                context=context,
                node_name="parent-message-generator",
                iteration=iteration,
                status="fallback" if result.fallback else "succeeded",
                input_summary=self._summary_text(
                    {
                        "issue_summary": context.issue_summary,
                        "teacher_note": context.teacher_note,
                        "revision_instructions": revision_instructions,
                    }
                ),
                output_summary=self._summary_text(result.draft),
                duration_ms=max(0, int((perf_counter() - started_at) * 1000)),
                metadata={
                    "task": "parent-message-reflexion",
                    "phase": "generator",
                    "source": result.source,
                    "model": result.model,
                    "provider": result.provider,
                    "fallback": result.fallback,
                    **({"debug": result.debug_meta} if result.debug_meta else {}),
                },
            )
            return result

        async def evaluate(draft: dict[str, Any], iteration: int) -> EvaluationStepResult:
            started_at = perf_counter()
            result = await self._evaluate_candidate(draft, context, iteration)
            await self._save_phase_trace(
                context=context,
                node_name="parent-message-evaluator",
                iteration=iteration,
                status="fallback" if result.fallback else "succeeded",
                input_summary=self._summary_text(
                    {
                        "title": draft.get("title"),
                        "summary": draft.get("summary"),
                        "wording_for_parent": draft.get("wording_for_parent"),
                    }
                ),
                output_summary=self._summary_text(
                    {
                        "score": result.score,
                        "can_send": result.can_send,
                        "problems": result.problems,
                        "revision_suggestions": result.revision_suggestions,
                        "decision": result.decision,
                    }
                ),
                duration_ms=max(0, int((perf_counter() - started_at) * 1000)),
                metadata={
                    "task": "parent-message-reflexion",
                    "phase": "evaluator",
                    "provider": result.provider,
                    "model": result.model,
                    "fallback": result.fallback,
                    "decision": result.decision,
                    **({"debug": result.debug_meta} if result.debug_meta else {}),
                },
            )
            return result

        def build_revision_instructions(evaluated: EvaluationStepResult, draft: dict[str, Any], iteration: int) -> str:
            instructions = self._build_revision_instructions(evaluated, draft, context)
            reflexion_records.append((iteration, instructions, evaluated.problems, evaluated.revision_suggestions))
            return instructions

        optimized = await self.optimizer.run(
            generate=generate,
            evaluate=evaluate,
            build_revision_instructions=build_revision_instructions,
            max_candidates=max_candidates,
        )

        for iteration, instructions, problems, suggestions in reflexion_records:
            await self._save_phase_trace(
                context=context,
                node_name="parent-message-reflexion",
                iteration=iteration,
                status="succeeded",
                input_summary=self._summary_text({"problems": problems, "revision_suggestions": suggestions}),
                output_summary=instructions,
                duration_ms=0,
                metadata={
                    "task": "parent-message-reflexion",
                    "phase": "reflexion",
                    "fallback": False,
                },
            )

        return self._build_response(context, optimized)

    def _build_context(self, request: ParentMessageReflexionRequest, payload: dict[str, Any]) -> ParentMessageContext:
        snapshot = safe_dict(payload.get("snapshot"))
        snapshot_child = safe_dict(snapshot.get("child"))
        intervention_card = self._normalize_object(request.current_intervention_card)
        guardian_feedback = self._normalize_object(request.latest_guardian_feedback)
        child_id = first_non_empty(
            [
                request.target_child_id or "",
                request.child_id or "",
                self._coerce_text(snapshot_child.get("id")),
                self._coerce_text(intervention_card.get("targetChildId")),
            ],
            "",
        )
        child_name = self._resolve_child_name(payload, child_id or None, snapshot_child, intervention_card)
        teacher_note = self._coerce_text(request.teacher_note)
        guardian_feedback_text = self._guardian_feedback_text(guardian_feedback)
        issue_summary = first_non_empty(
            [
                self._coerce_text(request.issue_summary),
                self._coerce_text(intervention_card.get("summary")),
                teacher_note,
                guardian_feedback_text,
            ],
            f"{child_name} 需要一段更温和、可执行的家园同步话术。",
        )
        today_actions = unique_texts(
            [
                *request.today_in_school_actions,
                self._coerce_text(intervention_card.get("todayInSchoolAction")),
                *[self._coerce_text(item) for item in safe_list(intervention_card.get("todayInSchoolActions"))],
                *[self._coerce_text(item) for item in safe_list(intervention_card.get("observationPoints"))[:1]],
            ],
            limit=4,
        )
        tonight_actions = unique_texts(
            [
                *request.tonight_home_actions,
                self._coerce_text(intervention_card.get("tonightHomeAction")),
                *[self._coerce_text(item) for item in safe_list(intervention_card.get("homeSteps"))[:2]],
                self._coerce_text(guardian_feedback.get("suggestedNextStep")),
            ],
            limit=4,
        )
        if not tonight_actions:
            tonight_actions = [
                "今晚先用 5 分钟观察孩子的情绪和入睡前状态。",
                "明早入园前用一句话告诉老师孩子昨晚的变化。",
            ]

        continuity_notes = self._build_continuity_notes(payload, child_name)
        follow_up_window = first_non_empty(
            [
                self._coerce_text(intervention_card.get("reviewIn48h")),
                self._coerce_text(intervention_card.get("followUpWindow")),
                "请在明早入园前简单反馈；48 小时内我们再一起复盘。",
            ],
            "请在明早入园前简单反馈；48 小时内我们再一起复盘。",
        )
        estimated_time = first_non_empty(
            [
                self._coerce_text(intervention_card.get("estimatedTime")),
                "5-10 分钟",
            ],
            "5-10 分钟",
        )
        memory_context = safe_dict(payload.get("memory_context"))
        trace_meta = safe_dict(payload.get("_memory_trace_meta"))
        memory_context_used = bool(trace_meta.get("memory_context_used")) or bool(memory_context)

        return ParentMessageContext(
            child_id=child_id or None,
            child_name=child_name,
            teacher_note=teacher_note,
            issue_summary=issue_summary,
            current_intervention_card=intervention_card,
            latest_guardian_feedback=guardian_feedback,
            today_in_school_actions=today_actions,
            tonight_home_actions=tonight_actions,
            continuity_notes=continuity_notes,
            follow_up_window=follow_up_window,
            estimated_time=estimated_time,
            session_id=request.session_id,
            trace_id=request.trace_id,
            debug_memory=request.debug_memory,
            debug_loop=request.debug_loop,
            memory_context_used=memory_context_used,
            memory_meta=self._build_memory_meta(payload),
            live_provider_enabled=can_use_vivo_text_provider(self.settings),
        )

    async def _generate_candidate(
        self,
        context: ParentMessageContext,
        revision_instructions: str | None,
        iteration: int,
    ) -> GeneratorStepResult:
        local_draft = self._build_local_draft(context, revision_instructions, iteration)
        if not context.live_provider_enabled:
            return GeneratorStepResult(
                draft=local_draft.model_dump(mode="json"),
                source="mock",
                model="local-parent-message-v1",
                provider="local-generator",
                fallback=False,
            )

        try:
            provider = resolve_text_provider(self.settings)
            provider_result = provider.summarize(
                prompt=self._build_generator_prompt(context, revision_instructions),
                fallback=json.dumps(local_draft.model_dump(mode="json", by_alias=True), ensure_ascii=False),
            )
        except ProviderAuthenticationError:
            raise
        except ProviderResponseError as error:
            logger.warning("parent message generator provider error: %s", error)
            return self._build_generator_fallback(
                local_draft=local_draft,
                provider_result=None,
                fallback_reason="provider-response-error",
                detail=str(error),
            )

        if provider_result.fallback or provider_result.source != "vivo":
            return self._build_generator_fallback(
                local_draft=local_draft,
                provider_result=provider_result,
                fallback_reason=self._provider_fallback_reason(provider_result),
            )

        try:
            parsed = self._extract_json_object(provider_result.text)
        except ValueError as error:  # pragma: no cover - defensive parsing fallback
            logger.warning("parent message generator JSON parse failed: %s", error)
            return self._build_generator_fallback(
                local_draft=local_draft,
                provider_result=provider_result,
                fallback_reason="json-parse-error",
                detail=str(error),
            )

        try:
            validated = ParentMessageProviderDraftOutput.model_validate(parsed)
        except ValidationError as error:  # pragma: no cover - defensive schema fallback
            logger.warning("parent message generator JSON schema mismatch: %s", error)
            return self._build_generator_fallback(
                local_draft=local_draft,
                provider_result=provider_result,
                fallback_reason="json-schema-mismatch",
                detail=str(error),
            )

        return GeneratorStepResult(
            draft=validated.model_dump(mode="json"),
            source=provider_result.source,
            model=provider_result.model,
            provider=provider_result.provider,
            fallback=False,
            debug_meta=self._build_provider_debug_meta(
                stage="generator",
                provider_result=provider_result,
                fallback_reason="structured-json-ok",
            ),
        )

    async def _evaluate_candidate(
        self,
        draft: dict[str, Any],
        context: ParentMessageContext,
        iteration: int,
    ) -> EvaluationStepResult:
        local_result = self._local_rule_evaluate(draft, context)
        if not context.live_provider_enabled:
            return local_result

        llm_result = await self._call_live_evaluator(draft, context, iteration)
        if llm_result.fallback:
            local_result.can_send = False
            local_result.retryable = False
            local_result.decision = "block"
            local_result.fallback = True
            local_result.stop_reason = "evaluator_fallback"
            local_result.problems = unique_texts(
                [*local_result.problems, *llm_result.problems],
                limit=6,
            )
            local_result.revision_suggestions = unique_texts(
                [*local_result.revision_suggestions, *llm_result.revision_suggestions],
                limit=6,
            )
            local_result.provider = llm_result.provider or local_result.provider
            local_result.model = llm_result.model or local_result.model
            local_result.debug_meta = llm_result.debug_meta
            return local_result

        combined_score = min(local_result.score, llm_result.score)
        combined_can_send = bool(local_result.can_send and llm_result.can_send and combined_score >= 8)
        combined_problems = unique_texts([*local_result.problems, *llm_result.problems], limit=6)
        combined_suggestions = unique_texts(
            [*local_result.revision_suggestions, *llm_result.revision_suggestions],
            limit=6,
        )
        decision = "approve" if combined_can_send else ("block" if not llm_result.retryable else "revise")
        return EvaluationStepResult(
            score=round(combined_score, 2),
            problems=combined_problems,
            revision_suggestions=combined_suggestions,
            can_send=combined_can_send,
            retryable=local_result.retryable and llm_result.retryable,
            decision=decision,
            fallback=False,
            provider=f"hybrid:{llm_result.provider or 'vivo-llm'}+local-rule",
            model=llm_result.model,
            stop_reason=llm_result.stop_reason,
        )

    async def _call_live_evaluator(
        self,
        draft: dict[str, Any],
        context: ParentMessageContext,
        iteration: int,
    ) -> EvaluationStepResult:
        try:
            provider = resolve_text_provider(self.settings)
            provider_result = provider.summarize(
                prompt=self._build_evaluator_prompt(context, draft, iteration),
                fallback="",
            )
        except ProviderAuthenticationError:
            raise
        except ProviderResponseError as error:
            logger.warning("parent message evaluator provider error: %s", error)
            return self._build_evaluator_fallback(
                provider_result=None,
                fallback_reason="provider-response-error",
                detail=str(error),
            )

        if provider_result.fallback or provider_result.source != "vivo":
            return self._build_evaluator_fallback(
                provider_result=provider_result,
                fallback_reason=self._provider_fallback_reason(provider_result),
            )

        try:
            parsed = self._extract_json_object(provider_result.text)
        except ValueError as error:  # pragma: no cover - defensive parsing fallback
            logger.warning("parent message evaluator JSON parse failed: %s", error)
            return self._build_evaluator_fallback(
                provider_result=provider_result,
                fallback_reason="json-parse-error",
                detail=str(error),
            )

        try:
            validated = ParentMessageProviderEvaluatorOutput.model_validate(parsed)
        except ValidationError as error:  # pragma: no cover - defensive schema fallback
            logger.warning("parent message evaluator JSON schema mismatch: %s", error)
            return self._build_evaluator_fallback(
                provider_result=provider_result,
                fallback_reason="json-schema-mismatch",
                detail=str(error),
            )

        score = self._normalize_score(validated.score)
        problems = [self._coerce_text(item) for item in validated.problems]
        suggestions = [self._coerce_text(item) for item in validated.revision_suggestions]
        can_send = bool(validated.can_send) and score >= 8
        retryable_bool = bool(validated.retryable)
        decision = self._coerce_text(validated.decision) or ("approve" if can_send else "revise")

        return EvaluationStepResult(
            score=score,
            problems=unique_texts([item for item in problems if item], limit=6),
            revision_suggestions=unique_texts([item for item in suggestions if item], limit=6),
            can_send=can_send,
            retryable=retryable_bool,
            decision=decision if decision in {"approve", "revise", "block"} else "revise",
            fallback=False,
            provider=provider_result.provider or "vivo-llm",
            model=provider_result.model,
            stop_reason=None,
            debug_meta=self._build_provider_debug_meta(
                stage="evaluator",
                provider_result=provider_result,
                fallback_reason="structured-json-ok",
            ),
        )

    def _local_rule_evaluate(self, draft: dict[str, Any], context: ParentMessageContext) -> EvaluationStepResult:
        title = self._coerce_text(draft.get("title"))
        summary = self._coerce_text(draft.get("summary"))
        wording = self._coerce_text(draft.get("wording_for_parent"))
        why = self._coerce_text(draft.get("why_this_matters"))
        estimated_time = self._coerce_text(draft.get("estimated_time"))
        follow_up_window = self._coerce_text(draft.get("follow_up_window"))
        tonight_actions = [self._coerce_text(item) for item in safe_list(draft.get("tonight_actions"))]
        tonight_actions = [item for item in tonight_actions if item]

        score = 10.0
        problems: list[str] = []
        suggestions: list[str] = []

        combined_text = " ".join([title, summary, wording, why, follow_up_window])
        if not title or not summary or not wording or not why or not estimated_time or not follow_up_window or not tonight_actions:
            score -= 3.0
            problems.append("核心字段还不完整，家长收到后可能抓不到重点。")
            suggestions.append("补齐标题、摘要、今晚动作、发送话术和跟进时间窗。")

        if any(keyword in combined_text for keyword in ANXIETY_KEYWORDS):
            score -= 2.0
            problems.append("措辞里有容易放大家长焦虑的表达。")
            suggestions.append("去掉“必须、严重、立刻”等高压词，改成温和提醒。")

        if any(keyword in combined_text for keyword in BLAME_KEYWORDS):
            score -= 2.0
            problems.append("有责备家长的语气，不利于家园协作。")
            suggestions.append("把责任式表达改成“我们一起观察/一起配合”的说法。")

        if not any(keyword in combined_text for keyword in SOFTENERS):
            score -= 1.0
            problems.append("整体语气还可以再柔和一点。")
            suggestions.append("加入“建议、可以、辛苦您、一起”等缓和表达。")

        if len(tonight_actions) == 0 or len(tonight_actions) > 3:
            score -= 1.5
            problems.append("今晚动作不够聚焦，家长不容易立刻执行。")
            suggestions.append("把今晚动作收敛到 1-3 条，优先保留当晚能完成的小动作。")

        if len(summary) > 80 or len(wording) > 220:
            score -= 1.0
            problems.append("文案略长，移动端一眼不够清楚。")
            suggestions.append("把摘要和发送话术再压缩一点，让家长 10 秒能看懂。")

        if not any(keyword in combined_text for keyword in CHILDCARE_SCENE_KEYWORDS):
            score -= 1.0
            problems.append("托育场景感不够强，像通用建议。")
            suggestions.append("明确“今晚、明早、老师、反馈、观察”等托育语境。")

        if context.child_name not in combined_text and "孩子" not in combined_text:
            score -= 0.5
            problems.append("对象感偏弱，家长不容易代入到自己的孩子。")
            suggestions.append("在摘要或话术里点到孩子或老师观察到的具体场景。")

        score = max(0.0, round(score, 2))
        retryable = True
        if not title and not summary and not wording:
            retryable = False

        can_send = score >= 8 and retryable and bool(tonight_actions) and bool(summary) and bool(wording)
        decision = "approve" if can_send else ("block" if not retryable else "revise")

        return EvaluationStepResult(
            score=score,
            problems=unique_texts(problems, limit=6),
            revision_suggestions=unique_texts(suggestions, limit=6),
            can_send=can_send,
            retryable=retryable,
            decision=decision,
            fallback=False,
            provider="local-rule",
            model="local-rule-v1",
            stop_reason=None,
        )

    def _build_local_draft(
        self,
        context: ParentMessageContext,
        revision_instructions: str | None,
        iteration: int,
    ) -> ParentMessageDraftOutput:
        tone_prefix = "辛苦您，"
        action_intro = "今晚可以先做这 2 个小动作："
        if revision_instructions:
            lowered = revision_instructions.lower()
            if any(token in revision_instructions for token in ("焦虑", "委婉", "柔和")):
                tone_prefix = "辛苦您，先不用太担心，"
            if any(token in revision_instructions for token in ("可执行", "明确", "清晰")):
                action_intro = "为了更容易执行，今晚先按下面这 2 步来："
            if "快速理解" in revision_instructions or "简洁" in lowered:
                action_intro = "今晚先做下面两步："

        tonight_actions = unique_texts(context.tonight_home_actions, limit=2)
        school_note = context.today_in_school_actions[0] if context.today_in_school_actions else "老师今天会继续补充在园观察。"
        continuity_note = context.continuity_notes[0] if context.continuity_notes else "这次会先用低压力的小动作把今晚反馈闭环。"
        summary = f"{context.child_name} 今晚先做 1-2 个小动作，帮助老师把白天观察和家庭反馈接起来。"
        wording = (
            f"{tone_prefix}今天老师留意到 {context.issue_summary}。{action_intro}"
            f"1. {tonight_actions[0]} 2. {tonight_actions[-1]} "
            f"如果方便，请在 {context.follow_up_window} 简单告诉老师孩子的反应，我们再一起判断下一步。"
        )
        why_this_matters = (
            "这样能把老师在园里的观察和家庭里的即时反应连起来，避免只凭单次表现判断。"
            f" {continuity_note}"
        )

        if iteration > 1 and revision_instructions:
            summary = f"{context.child_name} 今晚先做少量、明确、低压力的家庭观察动作，明早再和老师对齐。"
            wording = (
                f"{tone_prefix}今天老师有一个想和您轻轻对齐的小点：{context.issue_summary}。"
                f"今晚先做两步就可以：1. {tonight_actions[0]} 2. {tonight_actions[-1]} "
                f"不用一次做很多，只要把孩子当下的反应留意下来，并在 {context.follow_up_window} 简单告诉老师即可。"
            )
            why_this_matters = (
                "先把动作做小、做清楚，家长更容易执行，老师也更容易判断这是不是暂时波动。"
                f" {school_note}"
            )

        return ParentMessageDraftOutput(
            title=f"{context.child_name} 今晚沟通建议",
            summary=summary,
            tonight_actions=tonight_actions,
            wording_for_parent=wording,
            why_this_matters=why_this_matters,
            estimated_time=context.estimated_time,
            follow_up_window=context.follow_up_window,
        )

    def _build_generator_prompt(self, context: ParentMessageContext, revision_instructions: str | None) -> str:
        intervention_summary = self._coerce_text(context.current_intervention_card.get("summary"))
        guardian_feedback = self._guardian_feedback_text(context.latest_guardian_feedback)
        prompt_sections = [
            "你是 SmartChildcare Agent 的 Generator 节点，负责生成给家长的温和沟通稿或家庭小干预卡。",
            "请只返回一个严格 JSON object，不要输出 Markdown、解释、代码块、注释或额外前后缀。",
            "JSON 根节点必须是 object，不是数组；所有 key 必须使用双引号；不允许额外字段。",
            "JSON 字段必须只有：title, summary, tonight_actions, wording_for_parent, why_this_matters, estimated_time, follow_up_window。",
            '合法 JSON 形状示例：{"title":"...","summary":"...","tonight_actions":["..."],"wording_for_parent":"...","why_this_matters":"...","estimated_time":"...","follow_up_window":"..."}',
            "要求：语气温和、不责备、不制造焦虑、动作明确、适合托育场景、适合手机端快速阅读。",
            f"孩子：{context.child_name}",
            f"老师观察：{context.teacher_note or '暂无单独老师补充，优先使用问题摘要。'}",
            f"问题摘要：{context.issue_summary}",
            f"当前干预卡：{intervention_summary or '暂无'}",
            f"最近家长反馈：{guardian_feedback or '暂无'}",
            "今天园内动作：",
            *[f"- {item}" for item in context.today_in_school_actions[:3]],
            "今晚动作候选：",
            *[f"- {item}" for item in context.tonight_home_actions[:3]],
            "连续性提示：",
            *[f"- {item}" for item in context.continuity_notes[:4]],
            f"预计家长投入时长：{context.estimated_time}",
            f"跟进窗口：{context.follow_up_window}",
        ]
        if revision_instructions:
            prompt_sections.extend(
                [
                    "请根据以下评审建议重写，而不是原样返回：",
                    revision_instructions,
                ]
            )
        return "\n".join(prompt_sections)

    def _build_evaluator_prompt(self, context: ParentMessageContext, draft: dict[str, Any], iteration: int) -> str:
        payload = json.dumps(draft, ensure_ascii=False, indent=2)
        return "\n".join(
            [
                "你是 SmartChildcare Agent 的 Evaluator 节点，角色是资深托育园长 / 家园沟通顾问。",
                "请只返回一个严格 JSON object，不要输出 Markdown、解释、代码块、注释或额外前后缀。",
                "JSON 根节点必须是 object，不是数组；所有 key 必须使用双引号；不允许额外字段。",
                "你必须从以下维度审查：是否引发焦虑、是否过度责备、是否足够委婉、是否有明确可执行动作、是否容易被家长快速理解、是否符合托育场景。",
                "JSON 字段必须只有：score, problems, revision_suggestions, can_send, retryable, decision。",
                "score 为 0-10 的数值；只有 score >= 8 且 can_send=true 才算通过。",
                '合法 JSON 形状示例：{"score":8.5,"problems":["..."],"revision_suggestions":["..."],"can_send":true,"retryable":true,"decision":"revise"}',
                f"孩子：{context.child_name}",
                f"本轮迭代：{iteration}",
                "待评估草稿：",
                payload,
            ]
        )

    def _build_revision_instructions(
        self,
        evaluated: EvaluationStepResult,
        draft: dict[str, Any],
        context: ParentMessageContext,
    ) -> str:
        problem_text = "；".join(unique_texts(evaluated.problems, limit=4)) or "整体还不够温和清晰。"
        suggestion_text = "；".join(unique_texts(evaluated.revision_suggestions, limit=4)) or "请把动作写得更具体、语气更柔和。"
        return (
            f"请重写给 {context.child_name} 家长的话术。当前主要问题：{problem_text}。"
            f"修改方向：{suggestion_text}。"
            "重写后请保留托育场景、低焦虑语气、1-3 个今晚就能完成的小动作，并让家长在手机端 10 秒能看懂。"
        )

    def _build_response(
        self,
        context: ParentMessageContext,
        optimized: OptimizerRunResult,
    ) -> ParentMessageReflexionResponse:
        final_iteration = optimized.final_iteration
        final_eval = self._build_evaluation_meta(
            optimized=optimized,
            item=final_iteration,
            memory_context_used=context.memory_context_used,
            is_final=True,
        )
        if optimized.stop_reason in {
            "max_iterations",
            "evaluator_fallback",
            "non_retryable_error",
            "same_failure_twice",
            "same_output_twice",
        }:
            final_eval.can_send = False
            if final_eval.decision == "approve":
                final_eval.decision = "revise"

        final_output = ParentMessageFinalOutput(
            title=str(final_iteration.generator.draft.get("title") or ""),
            summary=str(final_iteration.generator.draft.get("summary") or ""),
            tonight_actions=[str(item) for item in safe_list(final_iteration.generator.draft.get("tonight_actions"))],
            wording_for_parent=str(final_iteration.generator.draft.get("wording_for_parent") or ""),
            why_this_matters=str(final_iteration.generator.draft.get("why_this_matters") or ""),
            estimated_time=str(final_iteration.generator.draft.get("estimated_time") or ""),
            follow_up_window=str(final_iteration.generator.draft.get("follow_up_window") or ""),
            evaluation_meta=final_eval,
        )

        debug_iterations: list[ParentMessageDebugIteration] | None = None
        if context.debug_loop and self.settings.environment != "production":
            debug_iterations = [
                ParentMessageDebugIteration(
                    iteration=item.iteration,
                    source=item.generator.source,
                    model=item.generator.model,
                    fallback=bool(item.generator.fallback or item.evaluation.fallback),
                    revision_instructions=item.revision_instructions,
                    candidate=ParentMessageFinalOutput(
                        title=str(item.generator.draft.get("title") or ""),
                        summary=str(item.generator.draft.get("summary") or ""),
                        tonight_actions=[str(action) for action in safe_list(item.generator.draft.get("tonight_actions"))],
                        wording_for_parent=str(item.generator.draft.get("wording_for_parent") or ""),
                        why_this_matters=str(item.generator.draft.get("why_this_matters") or ""),
                        estimated_time=str(item.generator.draft.get("estimated_time") or ""),
                        follow_up_window=str(item.generator.draft.get("follow_up_window") or ""),
                        evaluation_meta=self._build_evaluation_meta(
                            optimized=optimized,
                            item=item,
                            memory_context_used=context.memory_context_used,
                            is_final=item is final_iteration,
                        ),
                    ),
                    evaluation=self._build_evaluation_meta(
                        optimized=optimized,
                        item=item,
                        memory_context_used=context.memory_context_used,
                        is_final=item is final_iteration,
                    ),
                )
                for item in optimized.iterations
            ]

        return ParentMessageReflexionResponse(
            final_output=final_output,
            evaluation_meta=final_eval,
            revision_count=optimized.revision_count,
            source=final_iteration.generator.source,
            model=final_iteration.generator.model,
            fallback=optimized.fallback,
            continuity_notes=context.continuity_notes,
            memory_meta=context.memory_meta,
            debug_iterations=debug_iterations,
        )

    def _build_evaluation_meta(
        self,
        *,
        optimized: OptimizerRunResult,
        item: OptimizerIteration,
        memory_context_used: bool,
        is_final: bool,
    ) -> ParentMessageEvaluationMeta:
        stop_reason = optimized.stop_reason if is_final else (item.evaluation.stop_reason or "max_iterations")
        approved_iteration = (
            optimized.approved_iteration
            if is_final
            else (item.iteration if item.evaluation.can_send and item.evaluation.score >= 8 else None)
        )
        problems = unique_texts(item.evaluation.problems, limit=6)
        if is_final and item.generator.fallback:
            generator_warning = self._build_fallback_warning("生成阶段", item.generator.debug_meta.get("fallback_reason"))
            if generator_warning:
                problems = unique_texts([generator_warning, *problems], limit=6)

        return ParentMessageEvaluationMeta(
            score=round(float(item.evaluation.score), 2),
            can_send=bool(item.evaluation.can_send),
            problems=problems,
            revision_suggestions=unique_texts(item.evaluation.revision_suggestions, limit=6),
            iteration_scores=optimized.iteration_scores,
            approved_iteration=approved_iteration,
            stop_reason=stop_reason,
            fallback=bool(item.generator.fallback or item.evaluation.fallback or optimized.fallback),
            provider=item.evaluation.provider,
            model=item.evaluation.model,
            memory_context_used=memory_context_used,
            decision=item.evaluation.decision if item.evaluation.decision in {"approve", "revise", "block"} else "revise",
        )

    def _build_continuity_notes(self, payload: dict[str, Any], child_name: str) -> list[str]:
        notes = [self._coerce_text(item) for item in safe_list(payload.get("continuityNotes"))]
        memory_context = safe_dict(payload.get("memory_context"))
        prompt_context = safe_dict(memory_context.get("prompt_context"))
        if prompt_context:
            long_term = self._coerce_text(next(iter(safe_list(prompt_context.get("long_term_traits"))), ""))
            recent = self._coerce_text(next(iter(safe_list(prompt_context.get("recent_continuity_signals"))), ""))
            open_loop = self._coerce_text(next(iter(safe_list(prompt_context.get("open_loops"))), ""))
            if long_term:
                notes.append(f"参考了 {child_name} 的长期画像：{long_term}")
            if recent:
                notes.append(f"延续了最近一次沟通线索：{recent}")
            if open_loop:
                notes.append(f"本轮优先闭环的是：{open_loop}")
        return unique_texts([item for item in notes if item], limit=4)

    def _build_memory_meta(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not payload.get("debugMemory"):
            return None

        memory_context = safe_dict(payload.get("memory_context"))
        meta = safe_dict(memory_context.get("meta"))
        trace_meta = safe_dict(payload.get("_memory_trace_meta"))
        return {
            "backend": self._coerce_text(meta.get("backend")) or "memory",
            "degraded": bool(meta.get("degraded")),
            "usedSources": [str(item) for item in safe_list(meta.get("used_sources"))],
            "matchedSnapshotIds": [str(item) for item in safe_list(meta.get("matched_snapshot_ids"))],
            "matchedTraceIds": [str(item) for item in safe_list(meta.get("matched_trace_ids"))],
            **trace_meta,
        }

    def _build_generator_fallback(
        self,
        *,
        local_draft: ParentMessageDraftOutput,
        provider_result: ProviderTextResult | None,
        fallback_reason: str,
        detail: str | None = None,
    ) -> GeneratorStepResult:
        return GeneratorStepResult(
            draft=local_draft.model_dump(mode="json"),
            source="mock",
            model="local-parent-message-v1",
            provider=(provider_result.provider if provider_result else None) or "local-generator",
            fallback=True,
            stop_reason="generator_fallback",
            debug_meta=self._build_provider_debug_meta(
                stage="generator",
                provider_result=provider_result,
                fallback_reason=fallback_reason,
                detail=detail,
            ),
        )

    def _build_evaluator_fallback(
        self,
        *,
        provider_result: ProviderTextResult | None,
        fallback_reason: str,
        detail: str | None = None,
    ) -> EvaluationStepResult:
        warning = self._build_fallback_warning("评审阶段", fallback_reason)
        debug_meta = self._build_provider_debug_meta(
            stage="evaluator",
            provider_result=provider_result,
            fallback_reason=fallback_reason,
            detail=detail,
        )
        return EvaluationStepResult(
            score=0.0,
            problems=unique_texts(
                [warning, "智能评审阶段未能稳定返回结构化结果，本轮需要人工再看一眼。"],
                limit=6,
            ),
            revision_suggestions=unique_texts(["优先使用本地草稿做人工确认，暂不直接发送。"], limit=6),
            can_send=False,
            retryable=False,
            decision="block",
            fallback=True,
            provider=(provider_result.provider if provider_result else None) or "vivo-llm",
            model=provider_result.model if provider_result else None,
            stop_reason="evaluator_fallback",
            debug_meta=debug_meta,
        )

    @classmethod
    def _provider_fallback_reason(cls, provider_result: ProviderTextResult) -> str:
        meta = safe_dict(provider_result.meta)
        reason = cls._coerce_text(meta.get("reason"))
        if reason:
            return reason
        if provider_result.source != "vivo":
            return "non-vivo-source"
        return "provider-fallback"

    @classmethod
    def _build_provider_debug_meta(
        cls,
        *,
        stage: str,
        provider_result: ProviderTextResult | None,
        fallback_reason: str,
        detail: str | None = None,
    ) -> dict[str, Any]:
        meta = safe_dict(provider_result.meta if provider_result else {})
        return {
            key: value
            for key, value in {
                "fallback_stage": stage,
                "fallback_reason": fallback_reason,
                "fallback_reason_text": cls._format_fallback_reason(fallback_reason),
                "detail": detail,
                "provider_source": provider_result.source if provider_result else None,
                "provider_name": provider_result.provider if provider_result else None,
                "provider_model": provider_result.model if provider_result else None,
                "provider_request_id": provider_result.request_id if provider_result else None,
                "provider_meta_reason": cls._coerce_text(meta.get("reason")),
                "provider_status_code": meta.get("status_code"),
                "provider_upstream_id": cls._coerce_text(meta.get("upstream_id")),
            }.items()
            if value not in (None, "", [], {})
        }

    @classmethod
    def _build_fallback_warning(cls, stage: str, fallback_reason: Any) -> str:
        normalized_reason = cls._coerce_text(fallback_reason)
        reason_text = cls._format_fallback_reason(normalized_reason or "unknown")
        return f"{stage}已回退为本地兜底：{reason_text}。"

    @staticmethod
    def _format_fallback_reason(reason: str) -> str:
        return {
            "structured-json-ok": "provider 已稳定返回结构化 JSON",
            "provider-response-error": "上游服务响应异常",
            "provider-fallback": "provider 未返回可直接使用的结果",
            "non-vivo-source": "provider 未返回 vivo 实时结果",
            "timeout": "上游请求超时",
            "rate-limited": "上游请求被限流",
            "empty-content": "上游返回内容为空",
            "upstream-server-error": "上游服务暂时不可用",
            "json-parse-error": "provider 输出无法解析为 JSON 对象",
            "json-schema-mismatch": "provider 输出未通过 JSON 结构校验",
            "unknown": "provider 输出不稳定",
        }.get(reason, reason.replace("-", " "))

    async def _save_phase_trace(
        self,
        *,
        context: ParentMessageContext,
        node_name: str,
        iteration: int,
        status: str,
        input_summary: str | None,
        output_summary: str | None,
        duration_ms: int,
        metadata: dict[str, Any],
    ) -> None:
        if self.memory is None or not context.trace_id:
            return
        try:
            await self.memory.save_agent_trace(
                trace_id=context.trace_id,
                child_id=context.child_id,
                session_id=context.session_id,
                node_name=node_name,
                action_type="parent-message-reflexion",
                input_summary=input_summary,
                output_summary=output_summary,
                status=status,
                duration_ms=duration_ms,
                metadata_json={**metadata, "iteration": iteration},
            )
        except Exception as error:  # pragma: no cover - defensive logging
            logger.warning("Failed to persist parent message phase trace: %s", error)

    @staticmethod
    def _extract_json_object(text: str) -> dict[str, Any]:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("empty provider response")

        direct = ParentMessageReflexionService._try_load_json_object(cleaned)
        if direct is not None:
            return direct

        code_fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
        if code_fence:
            fenced = code_fence.group(1).strip()
            parsed = ParentMessageReflexionService._try_load_json_object(fenced)
            if parsed is not None:
                return parsed

        for match in re.finditer(r'"(?:\\.|[^"\\])*"', cleaned, re.DOTALL):
            parsed = ParentMessageReflexionService._try_load_json_object(match.group(0))
            if parsed is not None:
                return parsed

        balanced = ParentMessageReflexionService._find_first_json_object_slice(cleaned)
        if balanced is not None:
            parsed = ParentMessageReflexionService._try_load_json_object(balanced)
            if parsed is not None:
                return parsed

        raise ValueError("missing JSON object")

    @staticmethod
    def _try_load_json_object(payload: str, depth: int = 0) -> dict[str, Any] | None:
        if depth > 3 or not payload:
            return None

        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, dict):
            return parsed

        if isinstance(parsed, str):
            return ParentMessageReflexionService._try_load_json_object(parsed.strip(), depth + 1)

        balanced = ParentMessageReflexionService._find_first_json_object_slice(payload)
        if balanced and balanced != payload:
            return ParentMessageReflexionService._try_load_json_object(balanced, depth + 1)

        return None

    @staticmethod
    def _find_first_json_object_slice(payload: str) -> str | None:
        start: int | None = None
        depth = 0
        in_string = False
        escaped = False

        for index, char in enumerate(payload):
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
                continue

            if char == "{":
                if depth == 0:
                    start = index
                depth += 1
                continue

            if char == "}" and depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    return payload[start : index + 1]

        return None

    @staticmethod
    def _normalize_score(value: Any) -> float:
        try:
            score = float(value)
        except (TypeError, ValueError):
            return 0.0
        if score > 10:
            score = score / 10.0
        return max(0.0, min(10.0, round(score, 2)))

    @staticmethod
    def _normalize_object(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        text = ParentMessageReflexionService._coerce_text(value)
        return {"summary": text} if text else {}

    @staticmethod
    def _guardian_feedback_text(value: dict[str, Any]) -> str:
        return first_non_empty(
            [
                ParentMessageReflexionService._coerce_text(value.get("content")),
                ParentMessageReflexionService._coerce_text(value.get("summary")),
                ParentMessageReflexionService._coerce_text(value.get("feedback")),
                ParentMessageReflexionService._coerce_text(value.get("freeNote")),
            ],
            "",
        )

    @staticmethod
    def _resolve_child_name(
        payload: dict[str, Any],
        child_id: str | None,
        snapshot_child: dict[str, Any],
        intervention_card: dict[str, Any],
    ) -> str:
        for candidate in (
            ParentMessageReflexionService._coerce_text(snapshot_child.get("name")),
            ParentMessageReflexionService._coerce_text(intervention_card.get("targetChildName")),
        ):
            if candidate:
                return candidate

        for child in safe_list(payload.get("visibleChildren")):
            child_record = safe_dict(child)
            if child_id and ParentMessageReflexionService._coerce_text(child_record.get("id")) == child_id:
                name = ParentMessageReflexionService._coerce_text(child_record.get("name"))
                if name:
                    return name

        return "孩子"

    @staticmethod
    def _summary_text(value: Any, limit: int = 320) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
        else:
            text = json.dumps(value, ensure_ascii=False, default=str)
        if not text:
            return None
        return text if len(text) <= limit else f"{text[: limit - 3]}..."

    @staticmethod
    def _coerce_text(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()
