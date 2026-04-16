from __future__ import annotations

from datetime import datetime, timezone

from app.core.config import Settings
from app.providers.base import AsrProviderInput
from app.providers.resolver import resolve_asr_provider
from app.schemas.teacher_voice import (
    TeacherVoiceMeta,
    TeacherVoiceModelInfo,
    TeacherVoiceSourceInfo,
    TeacherVoiceTrace,
    TeacherVoiceTranscriptPayload,
    TeacherVoiceUnderstandRequest,
    TeacherVoiceUnderstandResponse,
)
from app.services.teacher_voice_copilot import (
    build_teacher_voice_copilot,
    build_teacher_voice_copilot_compat,
)
from app.services.teacher_voice_prompt_chain import build_draft_items
from app.services.teacher_voice_router import route_teacher_voice


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _unique_items(values: list[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        items.append(value)
    return items


def understand_teacher_voice(
    payload: TeacherVoiceUnderstandRequest,
    *,
    audio_bytes: bytes | None,
    settings: Settings,
    request_id: str,
    input_mode: str,
) -> TeacherVoiceUnderstandResponse:
    asr_provider = resolve_asr_provider(settings, prefer_vivo=True)
    asr_result = asr_provider.transcribe(
        AsrProviderInput(
            audio_bytes=audio_bytes,
            transcript=payload.transcript,
            attachment_name=payload.attachment_name,
            mime_type=payload.mime_type,
            duration_ms=payload.duration_ms,
            scene=payload.scene,
            fallback_text=payload.fallback_text,
        )
    )

    transcript_payload = TeacherVoiceTranscriptPayload(
        text=asr_result.output.transcript,
        source=asr_result.source,
        confidence=asr_result.output.confidence,
        provider=asr_result.provider,
        mode=asr_result.mode,
        fallback=asr_result.output.fallback,
        raw=asr_result.output.raw or {},
        meta=asr_result.output.meta or {},
    )

    router_result, router_warnings = route_teacher_voice(
        transcript_payload.text,
        child_id=payload.child_id,
        child_name=payload.child_name,
    )
    draft_items, chain_warnings = build_draft_items(router_result)

    warnings = _unique_items(
        [
            *router_warnings,
            *chain_warnings,
            *(
                ["transcript_empty"]
                if not transcript_payload.text.strip()
                else []
            ),
        ]
    )
    record_completion_hints, micro_training_sop, parent_communication_script = build_teacher_voice_copilot(
        transcript_payload,
        draft_items,
        warnings,
    )
    copilot_payload, compat_hints, compat_sop, compat_script = build_teacher_voice_copilot_compat(
        record_completion_hints,
        micro_training_sop,
        parent_communication_script,
    )

    return TeacherVoiceUnderstandResponse(
        transcript=transcript_payload,
        router_result=router_result,
        draft_items=draft_items,
        warnings=warnings,
        record_completion_hints=record_completion_hints,
        micro_training_sop=micro_training_sop,
        parent_communication_script=parent_communication_script,
        copilot=copilot_payload,
        recordCompletionHints=compat_hints,
        microTrainingSOP=compat_sop,
        parentCommunicationScript=compat_script,
        source=TeacherVoiceSourceInfo(
            asr=transcript_payload.source,
            router="rule",
            chaining="rule",
        ),
        model=TeacherVoiceModelInfo(
            asr=asr_result.model,
            router="rule-router-v1",
            chaining="rule-chain-v1",
        ),
        generated_at=_iso_now(),
        trace=TeacherVoiceTrace(
            request_id=request_id,
            trace_id=payload.trace_id,
            fallback=transcript_payload.fallback or "router_low_confidence" in warnings,
            input_mode="multipart" if input_mode == "multipart" else "json",
            stages=["asr", "router", "prompt_chain"],
        ),
        meta=TeacherVoiceMeta(
            scene=payload.scene,
            attachment_name=payload.attachment_name,
            mime_type=payload.mime_type,
            duration_ms=payload.duration_ms,
            asr={
                "provider": asr_result.provider,
                "mode": asr_result.mode,
                "confidence": asr_result.output.confidence,
                "raw": asr_result.output.raw or {},
                "meta": asr_result.output.meta or {},
            },
        ),
    )
