from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_follow_up, build_mock_suggestion


async def run_parent_suggestions(payload: dict[str, Any]) -> dict[str, Any]:
    return build_mock_suggestion({**payload, "workflow": str(payload.get("workflow") or "parent-suggestions")})


async def run_parent_follow_up(payload: dict[str, Any]) -> dict[str, Any]:
    return build_mock_follow_up({**payload, "workflow": str(payload.get("workflow") or "parent-follow-up")})
