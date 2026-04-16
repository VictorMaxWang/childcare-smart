from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.agents import router as agents_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.memory import router as memory_router
from app.api.v1.endpoints.multimodal import router as multimodal_router
from app.api.v1.endpoints.stream import router as stream_router
from app.api.v1.endpoints.teacher_voice import router as teacher_voice_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(agents_router)
api_router.include_router(memory_router)
api_router.include_router(multimodal_router)
api_router.include_router(stream_router)
api_router.include_router(teacher_voice_router)
