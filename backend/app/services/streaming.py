from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any


def encode_sse(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def mock_agent_stream(task: str, payload: dict[str, Any]) -> AsyncIterator[str]:
    yield encode_sse("meta", {"task": task, "status": "started", "timestamp": now_iso()})
    yield encode_sse("reasoning", {"message": "正在整理上下文快照。", "timestamp": now_iso()})
    yield encode_sse("tool", {"name": "mock-provider", "message": "当前使用 mock provider。", "timestamp": now_iso()})
    yield encode_sse(
        "final",
        {
            "message": "流式输出完成。",
            "task": task,
            "payloadKeys": sorted(list(payload.keys())),
            "timestamp": now_iso(),
        },
    )
