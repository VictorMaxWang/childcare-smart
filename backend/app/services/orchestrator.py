from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from time import perf_counter
from typing import Any, AsyncIterator, Awaitable, Callable
from uuid import uuid4

from app.agents.admin_agent import run_admin_agent
from app.agents.generator_evaluator import run_parent_message_reflexion
from app.agents.high_risk_consultation import (
    run_high_risk_consultation,
    stream_high_risk_consultation as run_high_risk_consultation_stream,
)
from app.agents.parent_agent import run_parent_follow_up, run_parent_suggestions
from app.agents.teacher_agent import run_teacher_agent
from app.agents.weekly_report import run_weekly_report
from app.core.config import get_settings
from app.db.repositories import (
    RepositoryBundle,
    RepositoryError,
    build_repository_bundle,
    close_repository_bundle,
    reset_repository_bundle_cache,
)
from app.memory.session_memory import SessionMemory
from app.memory.vector_store import SimpleVectorStore
from app.providers.mock import build_mock_diet_evaluation, build_mock_vision_meal
from app.services.admin_quality_metrics_engine import build_admin_quality_metrics_engine
from app.services.admin_consultation_feed import list_high_risk_consultation_feed
from app.services.demand_insight_engine import build_demand_insight_engine
from app.services.memory_service import MemoryService
from app.services.health_file_bridge_service import run_health_file_bridge
from app.services.high_risk_consultation_contract import (
    build_high_risk_done_event,
    normalize_high_risk_consultation_result,
)
from app.services.intent_router import route_intent
from app.services.parent_storybook_service import run_parent_storybook
from app.services.parent_trend_service import run_parent_trend_query
from app.services.react_runner import ReactRunner
from app.services.streaming import encode_sse, mock_agent_stream
from app.schemas.memory import MemoryContextBuildOptions
from app.schemas.react_tools import ReactRunRequest
from app.tools.summary_tools import safe_dict


logger = logging.getLogger(__name__)
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()


Runner = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


def _create_trace_id(task: str) -> str:
    return f"trace-{task}-{uuid4().hex}"


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _summarize_value(value: Any, limit: int = 480) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, default=str)
    if not text:
        return None
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


def _extract_child_id(*values: Any) -> str | None:
    keys = ("child_id", "childId", "targetChildId", "target_child_id")
    for value in values:
        if not isinstance(value, dict):
            continue
        for key in keys:
            item = _coerce_string(value.get(key))
            if item:
                return item
        snapshot = value.get("snapshot")
        if isinstance(snapshot, dict):
            child = snapshot.get("child")
            if isinstance(child, dict):
                item = _coerce_string(child.get("id"))
                if item:
                    return item
        visible_children = value.get("visibleChildren")
        if isinstance(visible_children, list):
            for child in visible_children:
                if isinstance(child, dict):
                    item = _coerce_string(child.get("id"))
                    if item:
                        return item
    return None


def _extract_child_ids(value: dict[str, Any], limit: int = 3) -> list[str]:
    child_ids: list[str] = []

    target_child_id = (
        _coerce_string(value.get("targetChildId"))
        or _coerce_string(value.get("childId"))
        or _coerce_string(value.get("child_id"))
    )
    if target_child_id:
        child_ids.append(target_child_id)

    snapshot = value.get("snapshot")
    if isinstance(snapshot, dict):
        child = snapshot.get("child")
        if isinstance(child, dict):
            item = _coerce_string(child.get("id"))
            if item:
                child_ids.append(item)

    visible_children = value.get("visibleChildren")
    if isinstance(visible_children, list):
        for child in visible_children:
            if not isinstance(child, dict):
                continue
            item = _coerce_string(child.get("id"))
            if item:
                child_ids.append(item)

    deduped: list[str] = []
    seen: set[str] = set()
    for item in child_ids:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
        if len(deduped) >= limit:
            break

    return deduped


def _extract_session_id(*values: Any) -> str | None:
    keys = (
        "session_id",
        "sessionId",
        "consultationId",
        "consultation_id",
        "relatedConsultationId",
        "related_consultation_id",
    )
    nested_keys = (
        "latestFeedback",
        "feedback",
        "currentInterventionCard",
        "snapshot",
        "result",
        "recentDetails",
    )

    def _scan(value: Any, depth: int = 0) -> str | None:
        if depth > 3:
            return None
        if isinstance(value, list):
            for item in value[:3]:
                resolved = _scan(item, depth + 1)
                if resolved:
                    return resolved
            return None
        if not isinstance(value, dict):
            return None
        for key in keys:
            item = _coerce_string(value.get(key))
            if item:
                return item
        for nested_key in nested_keys:
            resolved = _scan(value.get(nested_key), depth + 1)
            if resolved:
                return resolved
        return None

    for value in values:
        resolved = _scan(value)
        if resolved:
            return resolved
    return None


def _compact_feedback(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    compact: dict[str, Any] = {}
    for key in (
        "feedbackId",
        "childId",
        "sourceRole",
        "sourceChannel",
        "relatedTaskId",
        "relatedConsultationId",
        "executionStatus",
        "executionCount",
        "executorRole",
        "childReaction",
        "improvementStatus",
        "barriers",
        "notes",
        "attachments",
        "submittedAt",
        "source",
        "fallback",
        "id",
        "date",
        "status",
        "content",
        "interventionCardId",
        "sourceWorkflow",
        "executed",
        "improved",
        "freeNote",
    ):
        item = value.get(key)
        if item is not None:
            compact[key] = item

    return compact or None


def _extract_feedback_snapshot_fragment(*values: Any) -> dict[str, Any]:
    latest_feedback: dict[str, Any] | None = None
    recent_feedback: list[dict[str, Any]] = []
    seen: set[str] = set()

    def append_feedback(value: Any) -> None:
        nonlocal latest_feedback
        if isinstance(value, list):
            for item in value:
                append_feedback(item)
            return

        compact = _compact_feedback(value)
        if not compact:
            return

        key = (
            _coerce_string(compact.get("feedbackId"))
            or _coerce_string(compact.get("id"))
            or ":".join(
                [
                    _coerce_string(compact.get("childId")) or "",
                    _coerce_string(compact.get("submittedAt") or compact.get("date")) or "",
                    _coerce_string(compact.get("notes") or compact.get("content")) or "",
                ]
            )
        )
        if key in seen:
            return
        seen.add(key)
        if latest_feedback is None:
            latest_feedback = compact
        recent_feedback.append(compact)

    def append_from_record(record: Any) -> None:
        if not isinstance(record, dict):
            return
        append_feedback(record.get("latestFeedback"))
        append_feedback(record.get("feedback"))
        recent_details = safe_dict(record.get("recentDetails"))
        append_feedback(recent_details.get("feedback"))

    for value in values:
        append_from_record(value)
        if isinstance(value, dict):
            append_from_record(value.get("snapshot"))

    fragment: dict[str, Any] = {}
    if latest_feedback is not None:
        fragment["latestFeedback"] = latest_feedback
    if recent_feedback:
        fragment["recentDetails"] = {"feedback": recent_feedback[:3]}
    return fragment


def _build_trace_metadata(task: str, payload: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {"task": task}

    for source in (result, payload):
        if not isinstance(source, dict):
            continue
        for key in ("workflow", "source", "model", "mode", "title"):
            value = source.get(key)
            if value is not None and key not in metadata:
                metadata[key] = value

    child_id = _extract_child_id(result, payload)
    session_id = _extract_session_id(result, payload)
    if child_id:
        metadata["child_id"] = child_id
    if session_id:
        metadata["session_id"] = session_id

    memory_trace_meta = payload.get("_memory_trace_meta")
    if isinstance(memory_trace_meta, dict):
        metadata.update(memory_trace_meta)

    provider_trace = safe_dict(result.get("providerTrace"))
    trace_meta = safe_dict(result.get("traceMeta"))
    for key in (
        "requestId",
        "transport",
        "transportSource",
        "consultationSource",
        "fallbackReason",
        "brainProvider",
        "realProvider",
        "fallback",
    ):
        if key not in metadata:
            value = provider_trace.get(key)
            if value is None:
                value = trace_meta.get(key)
            if value is not None:
                metadata[key] = value

    return metadata


def _extract_memory_meta(payload: dict[str, Any]) -> dict[str, Any]:
    memory_context = payload.get("memory_context")
    if not isinstance(memory_context, dict):
        return {}
    meta = memory_context.get("meta")
    return meta if isinstance(meta, dict) else {}


def _debug_memory_enabled(payload: dict[str, Any]) -> bool:
    explicit = payload.get("debugMemory")
    if isinstance(explicit, bool):
        return explicit
    return get_settings().environment != "production"


def _memory_query(task: str, payload: dict[str, Any]) -> str | None:
    for key in ("question", "teacherNote", "issueSummary"):
        value = _coerce_string(payload.get(key))
        if value:
            return value
    if task == "parent-storybook":
        return "最近成长 亮点 家长 睡前 故事"
    if task == "high-risk-consultation":
        return "最近会诊 风险 闭环 家长反馈"
    if task in {"teacher-agent", "parent-follow-up"}:
        return "最近跟进 家长反馈 连续观察"
    if task == "parent-trend-query":
        return "最近儿童趋势 变化 家长问答"
    if task in {"weekly-report", "teacher-weekly-summary", "admin-weekly-ops-report"}:
        return "最近重点儿童 风险 闭环 周报"
    return None


def _resolve_weekly_memory_task(payload: dict[str, Any]) -> str:
    role = _coerce_string(payload.get("role"))
    if not role:
        snapshot = safe_dict(payload.get("snapshot"))
        role = _coerce_string(snapshot.get("role"))

    if role == "teacher":
        return "teacher-weekly-summary"
    if role == "admin":
        return "admin-weekly-ops-report"
    return "weekly-report"


def _resolve_weekly_snapshot_type(payload: dict[str, Any]) -> str:
    memory_task = _resolve_weekly_memory_task(payload)
    if memory_task == "teacher-weekly-summary":
        return "teacher-weekly-summary-result"
    if memory_task == "admin-weekly-ops-report":
        return "admin-weekly-ops-report-result"
    return "weekly-report-result"


@dataclass
class Orchestrator:
    repositories: RepositoryBundle
    memory: MemoryService

    def _should_skip_request_thread_memory(self, task: str) -> bool:
        return task == "parent-storybook"

    def _should_background_persistence(self, task: str) -> bool:
        return task == "parent-storybook"

    def _memory_trace_meta_for_skip(self) -> dict[str, Any]:
        return {
            "memory_context_used": False,
            "memory_context_count": 0,
            "memory_context_backend": self.repositories.backend,
            "memory_context_skipped_reason": "parent-storybook-request-thread-sla",
        }

    def _schedule_background_task(self, coroutine: Awaitable[None], *, label: str) -> None:
        task = asyncio.create_task(coroutine)
        _BACKGROUND_TASKS.add(task)

        def _finalize(completed_task: asyncio.Task[Any]) -> None:
            _BACKGROUND_TASKS.discard(completed_task)
            try:
                completed_task.result()
            except Exception:
                logger.exception("Background task failed: %s", label)

        task.add_done_callback(_finalize)

    async def _safe_save_trace(self, **kwargs: Any) -> None:
        try:
            await self.memory.save_agent_trace(**kwargs)
        except RepositoryError as error:
            logger.warning("Failed to persist agent trace (%s/%s): %s", error.backend, error.operation, error)

    async def _safe_save_snapshot(self, **kwargs: Any) -> None:
        try:
            await self.memory.save_consultation_snapshot(**kwargs)
        except RepositoryError as error:
            logger.warning("Failed to persist agent snapshot (%s/%s): %s", error.backend, error.operation, error)

    async def _prepare_payload_with_memory(self, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        effective_payload = dict(payload)
        effective_payload["debugMemory"] = _debug_memory_enabled(effective_payload)

        memory_task = task
        workflow = _coerce_string(effective_payload.get("workflow"))
        child_ids: list[str] = []
        if task == "high-risk-consultation":
            child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "parent-follow-up":
            child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "parent-message-reflexion":
            child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "parent-storybook":
            child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "parent-trend-query":
            child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "teacher-agent":
            if workflow == "weekly-summary":
                memory_task = "teacher-weekly-summary"
                child_ids = _extract_child_ids(effective_payload, limit=3)
            else:
                child_ids = _extract_child_ids(effective_payload, limit=1)
        elif task == "admin-agent" and workflow == "weekly-ops-report":
            memory_task = "admin-weekly-ops-report"
            child_ids = _extract_child_ids(effective_payload, limit=3)
        elif task == "weekly-report":
            memory_task = _resolve_weekly_memory_task(effective_payload)
            child_ids = _extract_child_ids(effective_payload, limit=3)

        if not child_ids:
            effective_payload["_memory_trace_meta"] = {
                "memory_context_used": False,
                "memory_context_count": 0,
                "memory_context_backend": self.repositories.backend,
            }
            return effective_payload

        memory_contexts = []
        for child_id in child_ids:
            context = await self.memory.build_memory_context_for_prompt(
                child_id,
                memory_task,
                MemoryContextBuildOptions(
                    limit=5,
                    top_k=5,
                    query=_memory_query(memory_task, effective_payload),
                    session_id=_extract_session_id(effective_payload),
                ),
            )
            memory_contexts.append(context.model_dump(mode="json"))

        primary_context = memory_contexts[0]
        effective_payload["memory_context"] = primary_context
        if len(memory_contexts) > 1:
            effective_payload["memory_contexts"] = memory_contexts

        used_sources = primary_context.get("meta", {}).get("used_sources", []) if isinstance(primary_context, dict) else []
        degraded = any(
            isinstance(context, dict) and isinstance(context.get("meta"), dict) and bool(context["meta"].get("degraded"))
            for context in memory_contexts
        )
        effective_payload["_memory_trace_meta"] = {
            "memory_context_used": True,
            "memory_context_count": len(memory_contexts),
            "memory_context_child_ids": child_ids,
            "memory_context_backend": self.repositories.backend,
            "memory_context_degraded": degraded,
            "memory_used_sources": used_sources,
        }
        return effective_payload

    def _brain_provider(self) -> str:
        settings = get_settings()
        return settings.brain_provider.strip().lower() or "unknown"

    def _normalize_high_risk_result(
        self,
        *,
        payload: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        provider_trace = safe_dict(result.get("providerTrace"))
        return normalize_high_risk_consultation_result(
            result,
            payload=payload,
            brain_provider=self._brain_provider(),
            default_transport="fastapi-brain",
            default_transport_source="fastapi-brain",
            default_consultation_source=_coerce_string(result.get("source"))
            or _coerce_string(provider_trace.get("consultationSource"))
            or "mock",
            default_fallback_reason=_coerce_string(provider_trace.get("fallbackReason")) or "",
        )

    async def _run_with_trace(
        self,
        *,
        task: str,
        payload: dict[str, Any],
        runner: Runner,
        node_name: str,
        snapshot_type: str | None = None,
    ) -> dict[str, Any]:
        if self._should_skip_request_thread_memory(task):
            effective_payload = dict(payload)
            effective_payload["debugMemory"] = _debug_memory_enabled(effective_payload)
            effective_payload["_memory_trace_meta"] = self._memory_trace_meta_for_skip()
        else:
            effective_payload = await self._prepare_payload_with_memory(task, payload)
        trace_id = _coerce_string(effective_payload.get("trace_id")) or _coerce_string(effective_payload.get("traceId")) or _create_trace_id(task)
        started_at = perf_counter()

        try:
            result = await runner(effective_payload)
        except Exception as error:
            duration_ms = max(0, int((perf_counter() - started_at) * 1000))
            trace_kwargs = {
                "trace_id": trace_id,
                "child_id": _extract_child_id(effective_payload),
                "session_id": _extract_session_id(effective_payload),
                "node_name": node_name,
                "action_type": task,
                "input_summary": _summarize_value(effective_payload),
                "output_summary": _summarize_value({"error": str(error), "type": type(error).__name__}),
                "status": "failed",
                "duration_ms": duration_ms,
                "metadata_json": {
                    "task": task,
                    "error_type": type(error).__name__,
                    **(
                        effective_payload.get("_memory_trace_meta")
                        if isinstance(effective_payload.get("_memory_trace_meta"), dict)
                        else {}
                    ),
                },
            }
            if self._should_background_persistence(task):
                self._schedule_background_task(
                    self._safe_save_trace(**trace_kwargs),
                    label=f"{task}:failed-trace",
                )
            else:
                await self._safe_save_trace(**trace_kwargs)
            raise

        duration_ms = max(0, int((perf_counter() - started_at) * 1000))
        child_id = _extract_child_id(result, effective_payload)
        session_id = _extract_session_id(result, effective_payload)

        if effective_payload.get("debugMemory") and isinstance(result, dict):
            memory_meta = result.get("memoryMeta")
            if isinstance(memory_meta, dict):
                result = {
                    **result,
                    "memoryMeta": {
                        **memory_meta,
                        **(effective_payload.get("_memory_trace_meta") if isinstance(effective_payload.get("_memory_trace_meta"), dict) else {}),
                    },
                }
            else:
                result = {
                    **result,
                    "memoryMeta": effective_payload.get("_memory_trace_meta"),
                }

        if task == "high-risk-consultation" and isinstance(result, dict):
            result = self._normalize_high_risk_result(payload=effective_payload, result=result)

        trace_kwargs = {
            "trace_id": trace_id,
            "child_id": child_id,
            "session_id": session_id,
            "node_name": node_name,
            "action_type": task,
            "input_summary": _summarize_value(effective_payload),
            "output_summary": _summarize_value(result),
            "status": "succeeded",
            "duration_ms": duration_ms,
            "metadata_json": _build_trace_metadata(task, effective_payload, result),
        }
        if self._should_background_persistence(task):
            self._schedule_background_task(
                self._safe_save_trace(**trace_kwargs),
                label=f"{task}:trace",
            )
        else:
            await self._safe_save_trace(**trace_kwargs)

        if snapshot_type and (child_id or session_id):
            snapshot_kwargs = {
                "child_id": child_id,
                "session_id": session_id,
                "snapshot_type": snapshot_type,
                "input_summary": _summarize_value(effective_payload),
                "snapshot_json": {
                    "task": task,
                    "traceId": trace_id,
                    **_extract_feedback_snapshot_fragment(result, effective_payload),
                    "result": result,
                },
            }
            if self._should_background_persistence(task):
                self._schedule_background_task(
                    self._safe_save_snapshot(**snapshot_kwargs),
                    label=f"{task}:snapshot",
                )
            else:
                await self._safe_save_snapshot(**snapshot_kwargs)

        return result

    async def parent_suggestions(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="parent-suggestions",
            payload=payload,
            runner=run_parent_suggestions,
            node_name="parent-suggestions",
        )

    async def parent_follow_up(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="parent-follow-up",
            payload=payload,
            runner=run_parent_follow_up,
            node_name="parent-follow-up",
            snapshot_type="parent-follow-up-result",
        )

    async def parent_message_reflexion(self, payload: dict[str, Any]) -> dict[str, Any]:
        trace_id = (
            _coerce_string(payload.get("trace_id"))
            or _coerce_string(payload.get("traceId"))
            or _create_trace_id("parent-message-reflexion")
        )
        reflexion_payload = {**payload, "traceId": trace_id}

        async def runner(effective_payload: dict[str, Any]) -> dict[str, Any]:
            return await run_parent_message_reflexion(effective_payload, memory=self.memory)

        return await self._run_with_trace(
            task="parent-message-reflexion",
            payload=reflexion_payload,
            runner=runner,
            node_name="parent-message-reflexion",
            snapshot_type="parent-message-reflexion-result",
        )

    async def parent_trend_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="parent-trend-query",
            payload=payload,
            runner=run_parent_trend_query,
            node_name="parent-trend-query",
            snapshot_type="parent-trend-result",
        )

    async def parent_storybook(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="parent-storybook",
            payload=payload,
            runner=run_parent_storybook,
            node_name="parent-storybook",
            snapshot_type="parent-storybook-result",
        )

    async def health_file_bridge(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="health-file-bridge",
            payload=payload,
            runner=run_health_file_bridge,
            node_name="health-file-bridge",
            snapshot_type="health-file-bridge-result",
        )

    async def teacher_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="teacher-agent",
            payload=payload,
            runner=run_teacher_agent,
            node_name="teacher-agent",
            snapshot_type="teacher-agent-result",
        )

    async def admin_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="admin-agent",
            payload=payload,
            runner=run_admin_agent,
            node_name="admin-agent",
            snapshot_type="admin-agent-result",
        )

    async def intent_router(self, payload: dict[str, Any]) -> dict[str, Any]:
        return route_intent(payload)

    async def weekly_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="weekly-report",
            payload=payload,
            runner=run_weekly_report,
            node_name="weekly-report",
            snapshot_type=_resolve_weekly_snapshot_type(payload),
        )

    async def high_risk_consultation(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._run_with_trace(
            task="high-risk-consultation",
            payload=payload,
            runner=run_high_risk_consultation,
            node_name="high-risk-consultation",
            snapshot_type="consultation-result",
        )

    async def stream_high_risk_consultation(self, payload: dict[str, Any]) -> AsyncIterator[str]:
        trace_id = (
            _coerce_string(payload.get("trace_id"))
            or _coerce_string(payload.get("traceId"))
            or _create_trace_id("high-risk-consultation")
        )
        started_at = perf_counter()

        async def event_source() -> AsyncIterator[str]:
            effective_payload = dict(payload)
            child_id = _extract_child_id(effective_payload)
            session_id = _extract_session_id(effective_payload)
            final_result: dict[str, Any] | None = None

            try:
                # Force an immediate frame so proxy/TLS smoke checks can prove the
                # stream is alive before memory hydration and provider work finish.
                yield ": stream-open\n\n"
                effective_payload = await self._prepare_payload_with_memory("high-risk-consultation", effective_payload)
                child_id = _extract_child_id(effective_payload)
                session_id = _extract_session_id(effective_payload)
                async for event, data in run_high_risk_consultation_stream(effective_payload, trace_id):
                    if event == "done":
                        result = data.get("result")
                        if isinstance(result, dict):
                            final_result = self._normalize_high_risk_result(
                                payload=effective_payload,
                                result=result,
                            )
                            data = build_high_risk_done_event(
                                trace_id=trace_id,
                                result=final_result,
                                payload=effective_payload,
                                brain_provider=self._brain_provider(),
                                default_transport="fastapi-brain",
                                default_transport_source="fastapi-brain",
                                default_consultation_source=_coerce_string(final_result.get("source")) or "mock",
                                default_fallback_reason=_coerce_string(
                                    safe_dict(safe_dict(final_result.get("providerTrace")).get("meta")).get("reason")
                                )
                                or _coerce_string(
                                    safe_dict(final_result.get("providerTrace")).get("fallbackReason")
                                )
                                or "",
                            )
                            child_id = _extract_child_id(final_result, effective_payload)
                            session_id = _extract_session_id(final_result, effective_payload)
                            duration_ms = max(0, int((perf_counter() - started_at) * 1000))
                            await self._safe_save_trace(
                                trace_id=trace_id,
                                child_id=child_id,
                                session_id=session_id,
                                node_name="high-risk-consultation",
                                action_type="high-risk-consultation",
                                input_summary=_summarize_value(effective_payload),
                                output_summary=_summarize_value(final_result),
                                status="succeeded",
                                duration_ms=duration_ms,
                                metadata_json=_build_trace_metadata("high-risk-consultation", effective_payload, final_result),
                            )
                            if child_id or session_id:
                                await self._safe_save_snapshot(
                                    child_id=child_id,
                                    session_id=session_id,
                                    snapshot_type="consultation-result",
                                    input_summary=_summarize_value(effective_payload),
                                    snapshot_json={
                                        "task": "high-risk-consultation",
                                        "traceId": trace_id,
                                        **_extract_feedback_snapshot_fragment(final_result, effective_payload),
                                        "result": final_result,
                                    },
                                )
                    yield encode_sse(event, data)
            except Exception as error:
                duration_ms = max(0, int((perf_counter() - started_at) * 1000))
                await self._safe_save_trace(
                    trace_id=trace_id,
                    child_id=child_id,
                    session_id=session_id,
                    node_name="high-risk-consultation",
                    action_type="high-risk-consultation",
                    input_summary=_summarize_value(effective_payload),
                    output_summary=_summarize_value({"error": type(error).__name__}),
                    status="failed",
                    duration_ms=duration_ms,
                    metadata_json={
                        "task": "high-risk-consultation",
                        "error_type": type(error).__name__,
                        **(
                            effective_payload.get("_memory_trace_meta")
                            if isinstance(effective_payload.get("_memory_trace_meta"), dict)
                            else {}
                        ),
                    },
                )
                yield encode_sse(
                    "error",
                    {
                        "traceId": trace_id,
                        "message": "high-risk consultation stream failed",
                        "errorType": type(error).__name__,
                    },
                )
                yield encode_sse(
                    "done",
                    build_high_risk_done_event(
                        trace_id=trace_id,
                        result=final_result,
                        payload=effective_payload,
                        brain_provider=self._brain_provider(),
                        default_transport="fastapi-brain",
                        default_transport_source="fastapi-brain",
                        default_consultation_source="high-risk-consultation",
                        default_fallback_reason=f"stream-failed:{type(error).__name__}",
                    ),
                )

        return event_source()

    async def high_risk_consultation_feed(
        self,
        *,
        limit: int = 10,
        child_id: str | None = None,
        risk_level: str | None = None,
        status: str | None = None,
        owner_name: str | None = None,
        escalated_only: bool = False,
    ) -> dict[str, Any]:
        return await list_high_risk_consultation_feed(
            repositories=self.repositories,
            limit=limit,
            child_id=child_id,
            risk_level=risk_level,
            status=status,
            owner_name=owner_name,
            escalated_only=escalated_only,
            brain_provider=self._brain_provider(),
        )

    async def demand_insights(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        effective_payload = payload or {}
        return await build_demand_insight_engine(
            repositories=self.repositories,
            app_snapshot=safe_dict(effective_payload.get("appSnapshot")) or None,
            institution_id=_coerce_string(effective_payload.get("institutionId")),
            window_days=int(effective_payload.get("windowDays") or 14),
            limit_per_category=int(effective_payload.get("limitPerCategory") or 5),
            consultation_limit=int(effective_payload.get("consultationLimit") or 40),
            today=_coerce_string(effective_payload.get("today")),
            include_weekly_signals=bool(
                effective_payload.get("includeWeeklySignals", True)
            ),
            brain_provider=self._brain_provider(),
        )

    async def admin_quality_metrics(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        effective_payload = payload or {}
        class_ids = None
        raw_class_ids = effective_payload.get("classIds")
        if isinstance(raw_class_ids, list):
            class_ids = [_coerce_string(item) for item in raw_class_ids]
        return await build_admin_quality_metrics_engine(
            repositories=self.repositories,
            app_snapshot=safe_dict(effective_payload.get("snapshot"))
            or safe_dict(effective_payload.get("appSnapshot"))
            or None,
            institution_id=_coerce_string(effective_payload.get("institutionId")),
            class_id=_coerce_string(effective_payload.get("classId")),
            class_ids=[item for item in class_ids or [] if item],
            window_days=int(effective_payload.get("windowDays") or 7),
            include_demo_fallback=bool(effective_payload.get("includeDemoFallback", True)),
            today=_coerce_string(effective_payload.get("today")),
            brain_provider=self._brain_provider(),
        )

    async def vision_meal(self, payload: dict[str, Any]) -> dict[str, Any]:
        trace_id = _coerce_string(payload.get("trace_id")) or _coerce_string(payload.get("traceId")) or _create_trace_id("vision-meal")
        started_at = perf_counter()
        result = build_mock_vision_meal(payload)
        duration_ms = max(0, int((perf_counter() - started_at) * 1000))
        await self._safe_save_trace(
            trace_id=trace_id,
            child_id=_extract_child_id(payload),
            session_id=_extract_session_id(payload),
            node_name="vision-meal",
            action_type="vision-meal",
            input_summary=_summarize_value(payload),
            output_summary=_summarize_value(result.output),
            status="succeeded",
            duration_ms=duration_ms,
            metadata_json={"task": "vision-meal", "source": result.mode, "model": result.model},
        )
        return {"foods": result.output, "source": result.mode, "model": result.model}

    async def diet_evaluation(self, payload: dict[str, Any]) -> dict[str, Any]:
        trace_id = _coerce_string(payload.get("trace_id")) or _coerce_string(payload.get("traceId")) or _create_trace_id("diet-evaluation")
        started_at = perf_counter()
        result = build_mock_diet_evaluation(payload)
        duration_ms = max(0, int((perf_counter() - started_at) * 1000))
        await self._safe_save_trace(
            trace_id=trace_id,
            child_id=_extract_child_id(payload),
            session_id=_extract_session_id(payload),
            node_name="diet-evaluation",
            action_type="diet-evaluation",
            input_summary=_summarize_value(payload),
            output_summary=_summarize_value(result),
            status="succeeded",
            duration_ms=duration_ms,
            metadata_json={"task": "diet-evaluation", "source": result.get("source"), "model": result.get("model")},
        )
        return result

    async def react_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = ReactRunRequest.model_validate(payload)
        runner = ReactRunner(repositories=self.repositories, memory=self.memory)
        result = await runner.run(request)
        return result.model_dump(mode="json", by_alias=True)

    async def stream_agent(self, task: str, payload: dict[str, Any]):
        return mock_agent_stream(task, payload)


@lru_cache(maxsize=1)
def _get_shared_session_memory() -> SessionMemory:
    return SessionMemory()


@lru_cache(maxsize=1)
def _get_shared_vector_store() -> SimpleVectorStore:
    return SimpleVectorStore()


@lru_cache(maxsize=1)
def _get_shared_memory_service() -> MemoryService:
    repositories = build_repository_bundle()
    return MemoryService(
        repositories=repositories,
        session_memory=_get_shared_session_memory(),
        vector_store=_get_shared_vector_store(),
    )


def build_orchestrator() -> Orchestrator:
    repositories = build_repository_bundle()
    return Orchestrator(repositories=repositories, memory=_get_shared_memory_service())


def build_memory_service() -> MemoryService:
    return _get_shared_memory_service()


def reset_orchestrator_runtime() -> None:
    reset_repository_bundle_cache()
    _get_shared_session_memory.cache_clear()
    _get_shared_vector_store.cache_clear()
    _get_shared_memory_service.cache_clear()


async def shutdown_orchestrator_runtime() -> None:
    try:
        await close_repository_bundle()
    finally:
        reset_orchestrator_runtime()
