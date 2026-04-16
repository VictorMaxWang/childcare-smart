from __future__ import annotations

import json
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any, Awaitable, Callable
from uuid import uuid4

from app.core.config import get_settings
from app.db.childcare_repository import ChildcareRepository
from app.db.repositories import RepositoryBundle
from app.schemas.react_tools import (
    ReactPersistence,
    ReactRunRequest,
    ReactRunResponse,
    ReactTargetChild,
    ReactTrace,
    ReactTraceStep,
    ToolCallResult,
    ToolError,
)
from app.services.memory_service import MemoryService
from app.tools.childcare_tools import ChildcareTools


def _create_trace_id() -> str:
    return f"trace-react-{uuid4().hex}"


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _summarize(value: Any, limit: int = 480) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, default=str)
    if not text:
        return None
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


def _profile_signals(profile_payload: dict[str, Any] | None) -> list[str]:
    if not isinstance(profile_payload, dict):
        return []
    profile = profile_payload.get("profile")
    if not isinstance(profile, dict):
        return []
    profile_json = profile.get("profileJson")
    if not isinstance(profile_json, dict):
        return []
    signals: list[str] = []
    for key in ("supportStrategies", "dietPreferences", "sleepPattern", "temperament", "specialNotes"):
        value = profile_json.get(key)
        if isinstance(value, list):
            text = "、".join(str(item) for item in value[:2])
        else:
            text = _coerce_string(value)
        if text:
            signals.append(f"{key}:{text}")
    return signals[:3]


def _sleep_signal_items(history_payload: dict[str, Any], observation_payload: dict[str, Any]) -> list[str]:
    evidence: list[str] = []
    observations = observation_payload.get("observations")
    if isinstance(observations, list):
        for item in observations:
            if not isinstance(item, dict):
                continue
            content = _coerce_string(item.get("content")) or ""
            if any(keyword in content for keyword in ("午睡", "哭", "想妈妈", "安抚", "分离")):
                date = _coerce_string(item.get("date")) or "未知时间"
                evidence.append(f"{date}: {content}")

    timeline = history_payload.get("timeline")
    if isinstance(timeline, list):
        for item in timeline:
            if not isinstance(item, dict):
                continue
            summary = _coerce_string(item.get("summary")) or ""
            if any(keyword in summary for keyword in ("午睡", "哭", "想妈妈", "安抚", "分离")):
                date = _coerce_string(item.get("date")) or "未知时间"
                evidence.append(f"{date}: {summary}")

    deduped: list[str] = []
    seen: set[str] = set()
    for item in evidence:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
        if len(deduped) >= 4:
            break
    return deduped


def _diet_signal_items(history_payload: dict[str, Any]) -> tuple[list[str], int]:
    evidence: list[str] = []
    picky_count = 0
    meals = history_payload.get("meals")
    if not isinstance(meals, list):
        return evidence, picky_count

    for record in meals:
        if not isinstance(record, dict):
            continue
        date = _coerce_string(record.get("date")) or "未知日期"
        foods = record.get("foods")
        food_text = "、".join(str(item) for item in foods[:3]) if isinstance(foods, list) else ""
        preference = (_coerce_string(record.get("preference")) or "").lower()
        intake_level = (_coerce_string(record.get("intakeLevel")) or "").lower()
        ai_summary = ""
        ai_evaluation = record.get("aiEvaluation")
        if isinstance(ai_evaluation, dict):
            ai_summary = _coerce_string(ai_evaluation.get("summary")) or ""
        combined = "；".join(part for part in [food_text, ai_summary] if part)
        if any(flag in preference for flag in ("dislike", "refuse")) or intake_level == "low" or any(
            keyword in combined for keyword in ("偏", "挑", "蔬菜", "回避", "未动", "只吃")
        ):
            picky_count += 1
            evidence.append(f"{date}: {combined or '出现低摄入或挑食信号'}")

    return evidence[:4], picky_count


def _detect_scenario(task: str) -> str | None:
    text = task.strip()
    if not text:
        return None
    if "午睡" in text and "哭" in text and ("家长" in text and ("提醒" in text or "通知" in text)):
        return "sleep_distress_notify"
    if ("饮食" in text or "偏食" in text or "吃饭" in text) and ("跟进" in text or "待跟进" in text or "趋势" in text):
        return "diet_trend_follow_up"
    return None


@dataclass(slots=True)
class ReactTraceRecorder:
    memory: MemoryService
    trace_id: str
    scenario: str
    role: str
    child_id: str | None
    session_id: str
    steps: list[ReactTraceStep] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    async def add_step(
        self,
        *,
        phase: str,
        message: str,
        tool: str | None = None,
        status: str = "succeeded",
        payload: Any = None,
        duration_ms: int | None = None,
    ) -> None:
        step = ReactTraceStep(
            step_index=len(self.steps) + 1,
            phase=phase,
            message=message,
            tool=tool,
            status=status,
            payload=payload,
            created_at=_now_iso(),
        )
        self.steps.append(step)
        try:
            await self.memory.save_agent_trace(
                trace_id=self.trace_id,
                child_id=self.child_id,
                session_id=self.session_id,
                node_name=tool or f"react-{phase.lower()}",
                action_type=phase.lower(),
                input_summary=_summarize(payload if phase in {"Thought", "Act"} else message),
                output_summary=_summarize(message if phase in {"Observe", "Final"} else payload),
                status=status,
                duration_ms=duration_ms,
                metadata_json={
                    "scenario": self.scenario,
                    "role": self.role,
                    "tool": tool,
                    "phase": phase,
                    "stepIndex": step.step_index,
                },
            )
        except Exception as error:  # pragma: no cover - defensive
            self.errors.append(f"trace_save:{type(error).__name__}")

    async def call_tool(
        self,
        *,
        tool_name: str,
        message: str,
        call: Callable[[], Awaitable[ToolCallResult]],
        payload: Any,
    ) -> ToolCallResult:
        await self.add_step(phase="Act", tool=tool_name, message=message, status="started", payload=payload)
        started_at = perf_counter()
        result = await call()
        duration_ms = max(0, int((perf_counter() - started_at) * 1000))
        await self.add_step(
            phase="Observe",
            tool=tool_name,
            message=result.error.message if result.error else f"{tool_name} completed",
            status="fallback" if result.fallback else ("succeeded" if result.ok else "failed"),
            payload=result.model_dump(mode="json", by_alias=True),
            duration_ms=duration_ms,
        )
        return result


@dataclass(slots=True)
class ReactRunner:
    repositories: RepositoryBundle
    memory: MemoryService

    async def run(self, request: ReactRunRequest) -> ReactRunResponse:
        scenario = _detect_scenario(request.task) or "unsupported"
        repository = await ChildcareRepository.create(
            app_snapshot=request.app_snapshot,
            institution_id=request.institution_id,
            database_url=get_settings().resolved_mysql_url,
        )
        tools = ChildcareTools(repository=repository, memory=self.memory)
        trace_id = request.trace_id or _create_trace_id()
        session_id = trace_id

        child = repository.get_child_by_id(request.child_id) if request.child_id else None
        if child is None:
            child = repository.find_child_from_task(request.task)
        child_summary = repository.child_summary(child) if child is not None else None
        child_id = _coerce_string(child_summary.get("childId")) if child_summary else None

        recorder = ReactTraceRecorder(
            memory=self.memory,
            trace_id=trace_id,
            scenario=scenario,
            role=request.role,
            child_id=child_id,
            session_id=session_id,
        )
        await recorder.add_step(
            phase="Thought",
            message="解析任务并选择固定 ReAct 工作流。",
            payload={"task": request.task, "role": request.role, "scenario": scenario, "source": repository.source},
        )

        if scenario == "unsupported":
            error = ToolError(code="unsupported_task", message="task does not match a supported ReAct workflow", retryable=False)
            final = {"error": error.model_dump(mode="json", by_alias=True)}
            await recorder.add_step(phase="Final", message=error.message, status="failed", payload=final)
            return await self._build_response(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario=scenario,
                target_child=None,
                tool_calls=[],
                final=final,
                action_summary=error.message,
                status="failed",
            )

        if child is None or child_id is None:
            error = ToolError(code="target_child_not_found", message="failed to resolve target child from childId or task text")
            final = {"error": error.model_dump(mode="json", by_alias=True)}
            await recorder.add_step(phase="Final", message=error.message, status="failed", payload=final)
            return await self._build_response(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario=scenario,
                target_child=None,
                tool_calls=[],
                final=final,
                action_summary=error.message,
                status="failed",
            )

        target_child = ReactTargetChild(
            child_id=child_id,
            name=_coerce_string(child_summary.get("name")) or child_id,
            nickname=_coerce_string(child_summary.get("nickname")),
            class_name=_coerce_string(child_summary.get("className")),
            institution_id=_coerce_string(child_summary.get("institutionId")),
        )

        if scenario == "sleep_distress_notify":
            return await self._run_sleep_distress_notify(
                request=request,
                repository=repository,
                tools=tools,
                recorder=recorder,
                target_child=target_child,
            )

        return await self._run_diet_trend_follow_up(
            request=request,
            repository=repository,
            tools=tools,
            recorder=recorder,
            target_child=target_child,
        )

    async def _run_sleep_distress_notify(
        self,
        *,
        request: ReactRunRequest,
        repository: ChildcareRepository,
        tools: ChildcareTools,
        recorder: ReactTraceRecorder,
        target_child: ReactTargetChild,
    ) -> ReactRunResponse:
        tool_calls: list[ToolCallResult] = []
        child_id = target_child.child_id

        recent_observations = await recorder.call_tool(
            tool_name="get_recent_observations",
            message="先读取最近观察，判断是否存在连续午睡哭闹信号。",
            payload={"childId": child_id, "limit": 6},
            call=lambda: tools.get_recent_observations(child_id, 6),
        )
        tool_calls.append(recent_observations)
        if not recent_observations.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="sleep_distress_notify",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=recent_observations,
            )

        history = await recorder.call_tool(
            tool_name="get_child_history",
            message="补读最近几天历史，确认是否有重复发生趋势。",
            payload={"childId": child_id, "days": 5},
            call=lambda: tools.get_child_history(child_id, 5),
        )
        tool_calls.append(history)
        if not history.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="sleep_distress_notify",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=history,
            )

        profile_memory = await recorder.call_tool(
            tool_name="get_child_profile_memory",
            message="读取 child profile memory，补足既往安抚偏好和睡眠提示。",
            payload={"childId": child_id},
            call=lambda: tools.get_child_profile_memory(child_id),
        )
        tool_calls.append(profile_memory)
        if not profile_memory.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="sleep_distress_notify",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=profile_memory,
            )

        await recorder.add_step(
            phase="Thought",
            message="已有足够证据，准备写入观察并生成给家长的提醒意图。",
            payload={
                "sleepSignals": history.data.get("aggregates", {}).get("sleepDistressSignals") if isinstance(history.data, dict) else None,
                "profileSignals": _profile_signals(profile_memory.data if isinstance(profile_memory.data, dict) else None),
            },
        )

        evidence = _sleep_signal_items(
            history.data if isinstance(history.data, dict) else {},
            recent_observations.data if isinstance(recent_observations.data, dict) else {},
        )
        repeated = len(evidence) >= 2 or (
            isinstance(history.data, dict)
            and isinstance(history.data.get("aggregates"), dict)
            and int(history.data["aggregates"].get("sleepDistressSignals") or 0) >= 2
        )
        observation_content = (
            f"今日午睡哭闹已与近几日记录对照，{target_child.name}存在"
            f"{'重复午睡情绪波动' if repeated else '单次午睡情绪波动'}信号，已建议持续观察并同步家长。"
        )
        insert_observation = await recorder.call_tool(
            tool_name="insert_observation",
            message="把本次午睡复盘写回观察记录。",
            payload={
                "childId": child_id,
                "type": "sleep_distress_follow_up",
                "content": observation_content,
            },
            call=lambda: tools.insert_observation(
                child_id,
                "sleep_distress_follow_up",
                observation_content,
                {
                    "category": "social-emotional",
                    "tags": ["午睡", "哭闹", "家园协同"],
                    "needsAttention": True,
                    "followUpAction": "明日继续观察午睡过渡，并与家长对齐睡前节律。",
                    "reviewDate": _now_iso()[:10],
                },
            ),
        )
        tool_calls.append(insert_observation)
        if not insert_observation.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="sleep_distress_notify",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=insert_observation,
            )

        profile_signals = _profile_signals(profile_memory.data if isinstance(profile_memory.data, dict) else None)
        notification_message = (
            f"{target_child.name}今天午睡前再次出现哭闹。"
            f"{'近几天也有类似记录，' if repeated else ''}"
            "园内已完成安抚与观察，今晚请留意睡前情绪和节律。"
        )
        if profile_signals:
            notification_message = f"{notification_message} 参考记忆：{'；'.join(profile_signals)}。"

        notification = await recorder.call_tool(
            tool_name="trigger_parent_notification",
            message="生成给家长的提醒动作。",
            payload={"childId": child_id, "msg": notification_message},
            call=lambda: tools.trigger_parent_notification(child_id, notification_message),
        )
        tool_calls.append(notification)
        if not notification.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="sleep_distress_notify",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=notification,
            )

        final = {
            "summary": f"已完成 {target_child.name} 午睡哭闹复盘，并生成家长提醒动作。",
            "judgement": {
                "repeatedSleepDistress": repeated,
                "evidenceCount": len(evidence),
            },
            "evidence": evidence,
            "actions": {
                "observationWritten": insert_observation.data,
                "parentNotification": notification.data,
                "profileSignals": profile_signals,
            },
        }
        action_summary = (
            f"已查询近几天午睡相关记录并写入新观察；"
            f"{'识别到重复哭闹趋势' if repeated else '暂未识别为连续高频趋势'}，"
            "已生成家长提醒动作。"
        )
        await recorder.add_step(phase="Final", message=action_summary, payload=final)
        return await self._build_response(
            request=request,
            repository=repository,
            recorder=recorder,
            scenario="sleep_distress_notify",
            target_child=target_child,
            tool_calls=tool_calls,
            final=final,
            action_summary=action_summary,
            status="succeeded",
        )

    async def _run_diet_trend_follow_up(
        self,
        *,
        request: ReactRunRequest,
        repository: ChildcareRepository,
        tools: ChildcareTools,
        recorder: ReactTraceRecorder,
        target_child: ReactTargetChild,
    ) -> ReactRunResponse:
        tool_calls: list[ToolCallResult] = []
        child_id = target_child.child_id

        history = await recorder.call_tool(
            tool_name="get_child_history",
            message="先读取近 7 天饮食历史。",
            payload={"childId": child_id, "days": 7},
            call=lambda: tools.get_child_history(child_id, 7),
        )
        tool_calls.append(history)
        if not history.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="diet_trend_follow_up",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=history,
            )

        recent_observations = await recorder.call_tool(
            tool_name="get_recent_observations",
            message="补读最近观察，避免只看餐次不看上下文。",
            payload={"childId": child_id, "limit": 4},
            call=lambda: tools.get_recent_observations(child_id, 4),
        )
        tool_calls.append(recent_observations)
        if not recent_observations.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="diet_trend_follow_up",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=recent_observations,
            )

        profile_memory = await recorder.call_tool(
            tool_name="get_child_profile_memory",
            message="读取 child profile memory，看是否已有饮食偏好记忆。",
            payload={"childId": child_id},
            call=lambda: tools.get_child_profile_memory(child_id),
        )
        tool_calls.append(profile_memory)
        if not profile_memory.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="diet_trend_follow_up",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=profile_memory,
            )

        evidence, picky_count = _diet_signal_items(history.data if isinstance(history.data, dict) else {})
        meal_count = (
            len(history.data.get("meals", []))
            if isinstance(history.data, dict) and isinstance(history.data.get("meals"), list)
            else 0
        )
        trend = picky_count >= 2 and meal_count >= 3
        profile_signals = _profile_signals(profile_memory.data if isinstance(profile_memory.data, dict) else None)

        await recorder.add_step(
            phase="Thought",
            message="已具备足够饮食证据，准备写入待跟进项。",
            payload={"pickyCount": picky_count, "mealCount": meal_count, "profileSignals": profile_signals},
        )

        draft_content = (
            f"{target_child.name}近 7 天饮食复盘："
            f"{'存在偏食趋势' if trend else '暂未形成明确偏食趋势'}。"
            "建议老师继续跟进蔬菜尝试和低摄入餐次。"
        )
        write_draft = await recorder.call_tool(
            tool_name="write_draft_record",
            message="写入一个教师端待跟进项。",
            payload={"childId": child_id, "draftType": "observation", "targetRole": "teacher"},
            call=lambda: tools.write_draft_record(
                child_id=child_id,
                draft_type="observation",
                target_role="teacher",
                content=draft_content,
                structured_payload={
                    "scenario": "diet_trend_follow_up",
                    "trendDetected": trend,
                    "evidence": evidence,
                    "profileSignals": profile_signals,
                    "recentObservationCount": len(
                        recent_observations.data.get("observations", [])
                        if isinstance(recent_observations.data, dict)
                        else []
                    ),
                },
            ),
        )
        tool_calls.append(write_draft)
        if not write_draft.ok:
            return await self._failure_from_tool(
                request=request,
                repository=repository,
                recorder=recorder,
                scenario="diet_trend_follow_up",
                target_child=target_child,
                tool_calls=tool_calls,
                failed_tool=write_draft,
            )

        final = {
            "summary": f"已完成 {target_child.name} 近 7 天饮食趋势复盘，并写入待跟进项。",
            "judgement": {
                "pickyEatingTrend": trend,
                "pickySignalCount": picky_count,
                "mealCount": meal_count,
            },
            "evidence": evidence,
            "actions": {
                "draftRecord": write_draft.data,
                "profileSignals": profile_signals,
            },
        }
        action_summary = (
            f"已查询近 7 天饮食记录并完成趋势判断；"
            f"{'存在偏食趋势' if trend else '目前偏食趋势不强'}，"
            "已写入教师端待跟进项。"
        )
        await recorder.add_step(phase="Final", message=action_summary, payload=final)
        return await self._build_response(
            request=request,
            repository=repository,
            recorder=recorder,
            scenario="diet_trend_follow_up",
            target_child=target_child,
            tool_calls=tool_calls,
            final=final,
            action_summary=action_summary,
            status="succeeded",
        )

    async def _failure_from_tool(
        self,
        *,
        request: ReactRunRequest,
        repository: ChildcareRepository,
        recorder: ReactTraceRecorder,
        scenario: str,
        target_child: ReactTargetChild,
        tool_calls: list[ToolCallResult],
        failed_tool: ToolCallResult,
    ) -> ReactRunResponse:
        final = {
            "error": failed_tool.error.model_dump(mode="json", by_alias=True) if failed_tool.error else {"message": "tool failed"},
            "failedTool": failed_tool.tool,
        }
        message = failed_tool.error.message if failed_tool.error else f"{failed_tool.tool} failed"
        await recorder.add_step(phase="Final", message=message, status="failed", payload=final)
        return await self._build_response(
            request=request,
            repository=repository,
            recorder=recorder,
            scenario=scenario,
            target_child=target_child,
            tool_calls=tool_calls,
            final=final,
            action_summary=message,
            status="failed",
        )

    async def _build_response(
        self,
        *,
        request: ReactRunRequest,
        repository: ChildcareRepository,
        recorder: ReactTraceRecorder,
        scenario: str,
        target_child: ReactTargetChild | None,
        tool_calls: list[ToolCallResult],
        final: dict[str, Any],
        action_summary: str,
        status: str,
    ) -> ReactRunResponse:
        snapshot_saved = True
        try:
            await self.memory.save_consultation_snapshot(
                child_id=target_child.child_id if target_child is not None else None,
                session_id=recorder.session_id,
                snapshot_type="react-run-result",
                input_summary=request.task,
                snapshot_json={
                    "scenario": scenario,
                    "status": status,
                    "traceId": recorder.trace_id,
                    "targetChild": target_child.model_dump(mode="json", by_alias=True) if target_child is not None else None,
                    "actionSummary": action_summary,
                    "toolCalls": [item.model_dump(mode="json", by_alias=True) for item in tool_calls],
                    "final": final,
                },
            )
        except Exception as error:  # pragma: no cover - defensive
            snapshot_saved = False
            recorder.errors.append(f"result_snapshot:{type(error).__name__}")

        return ReactRunResponse(
            trace_id=recorder.trace_id,
            status=status,
            scenario=scenario,
            target_child=target_child,
            action_summary=action_summary,
            final=final,
            tool_calls=tool_calls,
            trace=ReactTrace(steps=recorder.steps) if request.options.include_trace else None,
            persistence=ReactPersistence(
                trace_backend=self.repositories.backend,
                business_data_source=repository.source,
                business_data_persisted=repository.business_data_persisted,
                trace_saved=not any(item.startswith("trace_save:") for item in recorder.errors),
                result_snapshot_saved=snapshot_saved,
                errors=[*repository.errors, *recorder.errors],
            ),
            fallback=repository.fallback or any(item.fallback for item in tool_calls),
        )
