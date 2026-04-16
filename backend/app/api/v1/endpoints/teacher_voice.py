from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from app.core.config import Settings, get_settings
from app.schemas.teacher_voice import TeacherVoiceUnderstandRequest, TeacherVoiceUnderstandResponse
from app.services.teacher_voice_understand import understand_teacher_voice


router = APIRouter(tags=["teacher-voice"])


def get_settings_dependency() -> Settings:
    return get_settings()


def _to_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _to_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


async def _parse_request_payload(request: Request) -> tuple[dict[str, object], bytes | None, str]:
    content_type = request.headers.get("content-type", "").lower()
    if "multipart/form-data" in content_type:
        form = await request.form()
        audio = form.get("audio")
        audio_file = audio if isinstance(audio, UploadFile) else None
        audio_bytes = await audio_file.read() if audio_file else None
        payload: dict[str, object] = {
            "transcript": _to_str(form.get("transcript")),
            "fallbackText": _to_str(form.get("fallbackText")),
            "childId": _to_str(form.get("childId")),
            "childName": _to_str(form.get("childName")),
            "attachmentName": _to_str(form.get("attachmentName")) or (audio_file.filename if audio_file else None),
            "mimeType": _to_str(form.get("mimeType")) or (audio_file.content_type if audio_file else None),
            "durationMs": _to_int(form.get("durationMs")),
            "scene": _to_str(form.get("scene")),
            "traceId": _to_str(form.get("traceId")),
        }
        return payload, audio_bytes, "multipart"

    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be an object")

    return payload, None, "json"


@router.post("/agents/teacher/voice-understand", response_model=TeacherVoiceUnderstandResponse)
async def teacher_voice_understand(
    request: Request,
    settings: Settings = Depends(get_settings_dependency),
):
    payload_data, audio_bytes, input_mode = await _parse_request_payload(request)

    try:
        payload = TeacherVoiceUnderstandRequest.model_validate(payload_data)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors()) from exc

    has_transcript = bool((payload.transcript or "").strip())
    has_fallback_text = bool((payload.fallback_text or "").strip())
    has_audio = bool(audio_bytes)
    if not has_transcript and not has_fallback_text and not has_audio:
        raise HTTPException(status_code=400, detail="Missing transcript or audio input")

    request_id = request.headers.get("x-request-id") or uuid4().hex
    return understand_teacher_voice(
        payload,
        audio_bytes=audio_bytes,
        settings=settings,
        request_id=request_id,
        input_mode=input_mode,
    )
