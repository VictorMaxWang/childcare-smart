from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_admin_result, build_mock_weekly_report


async def run_admin_agent(payload: dict[str, Any]) -> dict[str, Any]:
    workflow = str(payload.get("workflow") or "daily-priority")
    if workflow == "weekly-ops-report":
        report = build_mock_weekly_report({**payload, "workflow": workflow})
        return {
            "workflow": workflow,
            **report,
            "title": "园长周报",
            "generatedAt": report.get("generatedAt"),
        }
    return build_mock_admin_result({**payload, "workflow": workflow})
