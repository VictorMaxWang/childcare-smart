from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.health_file_bridge import HealthFileBridgeWritebackRequest
from app.schemas.memory import MemoryContextBuildRequest
from app.services.memory_service import MemoryService
from app.services.orchestrator import build_memory_service

router = APIRouter(tags=["memory"])


def get_memory_service() -> MemoryService:
    return build_memory_service()


@router.post("/memory/context")
async def build_memory_context(
    payload: MemoryContextBuildRequest,
    memory_service: MemoryService = Depends(get_memory_service),
):
    return await memory_service.build_memory_context_for_prompt(
        payload.child_id,
        payload.workflow_type,
        payload.options,
    )


@router.post("/memory/health-file-bridge-writeback")
async def save_health_file_bridge_writeback(
    payload: HealthFileBridgeWritebackRequest,
    memory_service: MemoryService = Depends(get_memory_service),
):
    record = await memory_service.save_health_file_bridge_writeback(
        child_id=payload.child_id,
        bridge_writeback=payload.bridge_writeback.model_dump(mode="json", by_alias=True),
        session_id=payload.session_id,
        trace_id=payload.trace_id,
    )
    return record.model_dump(mode="json")
