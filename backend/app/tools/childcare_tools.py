from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from app.db.childcare_repository import ChildcareRepository
from app.schemas.react_tools import ToolCallResult, ToolError
from app.services.memory_service import MemoryService


def _create_call_id(tool: str) -> str:
    return f"{tool}-{uuid4().hex}"


def _validation_error(tool: str, message: str, details: dict[str, Any] | None = None) -> ToolCallResult:
    return ToolCallResult(
        ok=False,
        tool=tool,
        call_id=_create_call_id(tool),
        source="validation",
        fallback=False,
        error=ToolError(code="validation_error", message=message, retryable=False, details=details),
    )


def _tool_success(
    *,
    tool: str,
    source: str,
    fallback: bool,
    data: Any,
) -> ToolCallResult:
    return ToolCallResult(
        ok=True,
        tool=tool,
        call_id=_create_call_id(tool),
        source=source,
        fallback=fallback,
        data=data,
    )


def _tool_failure(
    *,
    tool: str,
    source: str,
    fallback: bool,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    retryable: bool = False,
) -> ToolCallResult:
    return ToolCallResult(
        ok=False,
        tool=tool,
        call_id=_create_call_id(tool),
        source=source,
        fallback=fallback,
        error=ToolError(code=code, message=message, retryable=retryable, details=details),
    )


@dataclass(slots=True)
class ChildcareTools:
    repository: ChildcareRepository
    memory: MemoryService

    async def get_child_history(self, child_id: str, days: int) -> ToolCallResult:
        tool = "get_child_history"
        if not child_id:
            return _validation_error(tool, "child_id is required")
        if days <= 0:
            return _validation_error(tool, "days must be greater than 0", {"days": days})

        child = self.repository.get_child_by_id(child_id)
        if child is None:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=self.repository.fallback,
                code="target_child_not_found",
                message="child was not found in the available snapshot",
                details={"childId": child_id},
            )

        return _tool_success(
            tool=tool,
            source=self.repository.source,
            fallback=self.repository.fallback,
            data=self.repository.get_child_history(child_id, days),
        )

    async def get_recent_observations(self, child_id: str, limit: int) -> ToolCallResult:
        tool = "get_recent_observations"
        if not child_id:
            return _validation_error(tool, "child_id is required")
        if limit <= 0:
            return _validation_error(tool, "limit must be greater than 0", {"limit": limit})

        child = self.repository.get_child_by_id(child_id)
        if child is None:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=self.repository.fallback,
                code="target_child_not_found",
                message="child was not found in the available snapshot",
                details={"childId": child_id},
            )

        return _tool_success(
            tool=tool,
            source=self.repository.source,
            fallback=self.repository.fallback,
            data={
                "child": self.repository.child_summary(child),
                "observations": self.repository.get_recent_observations(child_id, limit),
                "limit": limit,
            },
        )

    async def insert_observation(
        self,
        child_id: str,
        observation_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> ToolCallResult:
        tool = "insert_observation"
        if not child_id:
            return _validation_error(tool, "child_id is required")
        if not observation_type.strip():
            return _validation_error(tool, "type is required")
        if not content.strip():
            return _validation_error(tool, "content is required")

        child = self.repository.get_child_by_id(child_id)
        if child is None:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=self.repository.fallback,
                code="target_child_not_found",
                message="child was not found in the available snapshot",
                details={"childId": child_id},
            )

        try:
            result = await self.repository.insert_observation(
                child_id=child_id,
                observation_type=observation_type,
                content=content,
                metadata=metadata,
            )
        except Exception as error:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=True,
                code="tool_execution_failed",
                message="failed to write observation",
                details={"errorType": type(error).__name__},
                retryable=True,
            )

        return _tool_success(
            tool=tool,
            source=self.repository.source,
            fallback=self.repository.fallback and not bool(result.get("persisted")),
            data=result,
        )

    async def write_draft_record(
        self,
        *,
        child_id: str,
        draft_type: str,
        target_role: str,
        content: str,
        structured_payload: dict[str, Any] | None = None,
    ) -> ToolCallResult:
        tool = "write_draft_record"
        if not child_id:
            return _validation_error(tool, "child_id is required")
        if not draft_type.strip():
            return _validation_error(tool, "draft_type is required")
        if not target_role.strip():
            return _validation_error(tool, "target_role is required")
        if not content.strip():
            return _validation_error(tool, "content is required")

        child = self.repository.get_child_by_id(child_id)
        if child is None:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=self.repository.fallback,
                code="target_child_not_found",
                message="child was not found in the available snapshot",
                details={"childId": child_id},
            )

        try:
            result = await self.repository.write_draft_record(
                child_id=child_id,
                draft_type=draft_type,
                target_role=target_role,
                content=content,
                structured_payload=structured_payload,
            )
        except Exception as error:
            return _tool_failure(
                tool=tool,
                source=self.repository.source,
                fallback=True,
                code="tool_execution_failed",
                message="failed to write draft record",
                details={"errorType": type(error).__name__},
                retryable=True,
            )

        return _tool_success(
            tool=tool,
            source=self.repository.source,
            fallback=self.repository.fallback and not bool(result.get("persisted")),
            data=result,
        )

    async def trigger_parent_notification(self, child_id: str, msg: str) -> ToolCallResult:
        tool = "trigger_parent_notification"
        if not child_id:
            return _validation_error(tool, "child_id is required")
        if not msg.strip():
            return _validation_error(tool, "msg is required")

        child = self.repository.get_child_by_id(child_id)
        if child is None:
            return _tool_failure(
                tool=tool,
                source="notification_intent",
                fallback=True,
                code="target_child_not_found",
                message="child was not found in the available snapshot",
                details={"childId": child_id},
            )

        return _tool_success(
            tool=tool,
            source="notification_intent",
            fallback=True,
            data={
                "status": "intent_logged",
                "message": msg,
                "child": self.repository.child_summary(child),
                "channel": "parent_notification",
                "note": "v1 keeps notification as an explicit fallback intent until a real delivery backend is wired.",
            },
        )

    async def get_child_profile_memory(self, child_id: str) -> ToolCallResult:
        tool = "get_child_profile_memory"
        if not child_id:
            return _validation_error(tool, "child_id is required")

        try:
            record = await self.memory.get_child_profile_memory(child_id)
        except Exception as error:
            return _tool_failure(
                tool=tool,
                source="memory_hub",
                fallback=True,
                code="tool_execution_failed",
                message="failed to load child profile memory",
                details={"errorType": type(error).__name__},
                retryable=True,
            )

        return _tool_success(
            tool=tool,
            source="memory_hub",
            fallback=False,
            data={
                "childId": child_id,
                "found": record is not None,
                "profile": record.model_dump(mode="json", by_alias=True) if record is not None else None,
            },
        )
