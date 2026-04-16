from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_teacher_result


async def run_teacher_agent(payload: dict[str, Any]) -> dict[str, Any]:
    return build_mock_teacher_result({**payload, "workflow": str(payload.get("workflow") or "follow-up")})
