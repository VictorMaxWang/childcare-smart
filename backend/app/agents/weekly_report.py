from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_weekly_report
from app.services.weekly_report_contract import resolve_weekly_report_role


async def run_weekly_report(payload: dict[str, Any]) -> dict[str, Any]:
    role = resolve_weekly_report_role(payload)
    if role is None:
        raise ValueError("weekly report role is required")
    return build_mock_weekly_report({**payload, "role": role})
