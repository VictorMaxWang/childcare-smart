from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.services.orchestrator import Orchestrator, build_orchestrator

router = APIRouter(tags=["multimodal"])


def get_orchestrator() -> Orchestrator:
    return build_orchestrator()


@router.post("/multimodal/vision-meal")
async def vision_meal(payload: dict[str, Any], orchestrator: Orchestrator = Depends(get_orchestrator)):
    return await orchestrator.vision_meal(payload)


@router.post("/multimodal/diet-evaluation")
async def diet_evaluation(payload: dict[str, Any], orchestrator: Orchestrator = Depends(get_orchestrator)):
    return await orchestrator.diet_evaluation(payload)
