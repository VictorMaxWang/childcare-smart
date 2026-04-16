from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.services.orchestrator import Orchestrator, build_orchestrator

router = APIRouter(tags=["stream"])


def get_orchestrator() -> Orchestrator:
    return build_orchestrator()


@router.post("/stream/agent")
async def stream_agent(payload: dict[str, Any], orchestrator: Orchestrator = Depends(get_orchestrator)):
    stream = await orchestrator.stream_agent(str(payload.get("task") or "agent"), payload)

    async def event_source():
        async for chunk in stream:
            yield chunk

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
