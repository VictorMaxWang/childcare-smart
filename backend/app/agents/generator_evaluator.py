from __future__ import annotations

from typing import Any

from app.services.memory_service import MemoryService
from app.services.parent_message_reflexion import ParentMessageReflexionService


async def run_parent_message_reflexion(
    payload: dict[str, Any],
    *,
    memory: MemoryService | None = None,
) -> dict[str, Any]:
    service = ParentMessageReflexionService(memory=memory)
    result = await service.run(payload)
    return result.model_dump(mode="json", by_alias=True)
