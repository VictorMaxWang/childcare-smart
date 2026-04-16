from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import requests

from app.core.config import Settings
from app.providers.base import (
    AsrProviderInput,
    AsrSegment,
    AsrTranscription,
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
    ProviderResult,
)

DEFAULT_ATTACHMENT_NAME = "teacher-voice-note.webm"
DEFAULT_MIME_TYPE = "application/octet-stream"
ASR_ENGINE_ID = "fileasrrecorder"
ASR_MODEL_NAME = "fileasrrecorder"
ASR_UPLOAD_SLICE_BYTES = 5 * 1024 * 1024
ASR_MAX_SLICES = 100
ASR_POLL_INTERVAL_SECONDS = 1.0
ASR_POLL_TIMEOUT_SECONDS = 90.0
ASR_TRANSPORT_NAME = "vivo-lasr-http"


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _build_mock_transcript(input: AsrProviderInput) -> str:
    transcript = _normalize_text(input.fallback_text)
    if transcript:
        return transcript

    attachment_name = _normalize_text(input.attachment_name) or DEFAULT_ATTACHMENT_NAME
    return (
        f"{attachment_name} 转写结果：小朋友今天午睡前情绪波动，"
        "老师需要记录体温、饮水和离园后的家庭观察反馈。"
    )


def _build_meta(input: AsrProviderInput, *, reason: str) -> dict[str, object]:
    return {
        "attachment_name": input.attachment_name,
        "mime_type": input.mime_type,
        "duration_ms": input.duration_ms,
        "scene": input.scene,
        "language": input.language,
        "reason": reason,
    }


def _to_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass
class _StageResponse:
    stage: str
    payload: dict[str, Any]
    status_code: int


@dataclass
class _TransportResult:
    transcript: str
    segments: list[AsrSegment]
    request_id: str
    model: str
    meta: dict[str, Any]
    raw: dict[str, Any]


class VivoAsrTransportError(RuntimeError):
    def __init__(
        self,
        *,
        stage: str,
        reason: str,
        status_code: int | None = None,
        business_code: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(f"Vivo ASR {stage} failed: {reason}")
        self.stage = stage
        self.reason = reason
        self.status_code = status_code
        self.business_code = business_code
        self.payload = payload or {}


class MockAsrProvider:
    provider_name = "mock-asr"

    def transcribe(self, input: AsrProviderInput) -> ProviderResult[AsrTranscription]:
        transcript = _normalize_text(input.transcript)
        request_id = uuid4().hex
        if transcript:
            return ProviderResult(
                provider=self.provider_name,
                mode="mock",
                source="provided_transcript",
                request_id=request_id,
                output=AsrTranscription(
                    transcript=transcript,
                    confidence=None,
                    meta=_build_meta(input, reason="provided-transcript"),
                    raw={"path": "provided_transcript"},
                    fallback=False,
                ),
            )

        mock_transcript = _build_mock_transcript(input)
        return ProviderResult(
            provider=self.provider_name,
            mode="mock",
            source="mock",
            request_id=request_id,
            output=AsrTranscription(
                transcript=mock_transcript,
                confidence=0.62,
                meta=_build_meta(input, reason="mock-transcript"),
                raw={"path": "mock-fallback"},
                fallback=True,
            ),
        )


class VivoAsrTransport:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def transcribe(self, input: AsrProviderInput, *, request_id: str) -> _TransportResult:
        attachment_name = _normalize_text(input.attachment_name) or DEFAULT_ATTACHMENT_NAME
        mime_type = _normalize_text(input.mime_type) or DEFAULT_MIME_TYPE
        if not input.audio_bytes:
            raise VivoAsrTransportError(stage="create", reason="missing-audio-bytes")

        app_key = self._require_app_key()
        started_at = time.perf_counter()
        session_id = uuid4().hex
        user_id = uuid4().hex
        audio_type = self._infer_audio_type(input)
        slices = self._slice_audio(input.audio_bytes)
        query = self._common_query_params(request_id=request_id, user_id=user_id)

        create_response = self._post_json(
            stage="create",
            path="/lasr/create",
            app_key=app_key,
            query_params=query,
            body={
                "audio_type": audio_type,
                "x-sessionId": session_id,
                "slice_num": len(slices),
            },
        )
        audio_id = self._require_string(create_response.payload.get("data"), "audio_id", stage="create")

        upload_responses: list[dict[str, Any]] = []
        for index, chunk in enumerate(slices):
            upload_response = self._post_upload(
                stage="upload",
                path="/lasr/upload",
                app_key=app_key,
                query_params={
                    **query,
                    "audio_id": audio_id,
                    "slice_index": index,
                    "x-sessionId": session_id,
                },
                file_name=attachment_name,
                mime_type=mime_type,
                content=chunk,
            )
            upload_responses.append(upload_response.payload)

        run_response = self._post_json(
            stage="run",
            path="/lasr/run",
            app_key=app_key,
            query_params=query,
            body={
                "audio_id": audio_id,
                "x-sessionId": session_id,
            },
        )
        task_id = self._require_string(run_response.payload.get("data"), "task_id", stage="run")

        progress_payloads: list[dict[str, Any]] = []
        deadline = time.monotonic() + ASR_POLL_TIMEOUT_SECONDS
        final_progress = None
        while True:
            progress_response = self._post_json(
                stage="progress",
                path="/lasr/progress",
                app_key=app_key,
                query_params=query,
                body={
                    "task_id": task_id,
                    "x-sessionId": session_id,
                },
            )
            progress_payloads.append(progress_response.payload)
            final_progress = _to_int((progress_response.payload.get("data") or {}).get("progress"))
            if final_progress is None:
                raise VivoAsrTransportError(
                    stage="progress",
                    reason="missing-progress",
                    status_code=progress_response.status_code,
                    payload=progress_response.payload,
                )
            if final_progress >= 100:
                break
            if time.monotonic() >= deadline:
                raise VivoAsrTransportError(
                    stage="progress",
                    reason="progress-timeout",
                    status_code=progress_response.status_code,
                    payload=progress_response.payload,
                )
            time.sleep(ASR_POLL_INTERVAL_SECONDS)

        result_response = self._post_json(
            stage="result",
            path="/lasr/result",
            app_key=app_key,
            query_params=query,
            body={
                "task_id": task_id,
                "x-sessionId": session_id,
            },
        )
        result_items = (result_response.payload.get("data") or {}).get("result")
        if not isinstance(result_items, list) or not result_items:
            raise VivoAsrTransportError(
                stage="result",
                reason="missing-result",
                status_code=result_response.status_code,
                payload=result_response.payload,
            )

        segments: list[AsrSegment] = []
        transcript_parts: list[str] = []
        for item in result_items:
            if not isinstance(item, dict):
                continue
            text = _normalize_text(item.get("onebest"))
            if not text:
                continue
            transcript_parts.append(text)
            segments.append(
                AsrSegment(
                    text=text,
                    start_ms=_to_int(item.get("bg")),
                    end_ms=_to_int(item.get("ed")),
                )
            )

        transcript = "".join(transcript_parts).strip()
        if not transcript:
            raise VivoAsrTransportError(
                stage="result",
                reason="empty-transcript",
                status_code=result_response.status_code,
                payload=result_response.payload,
            )

        latency_ms = int((time.perf_counter() - started_at) * 1000)
        meta = {
            "transport": ASR_TRANSPORT_NAME,
            "audio_type": audio_type,
            "slice_num": len(slices),
            "poll_count": len(progress_payloads),
            "final_progress": final_progress,
            "session_id": session_id,
            "audio_id": audio_id,
            "task_id": task_id,
            "sid": result_response.payload.get("sid"),
            "latency_ms": latency_ms,
        }
        raw = {
            "transport": ASR_TRANSPORT_NAME,
            "request": {
                "request_id": request_id,
                "user_id": user_id,
                "session_id": session_id,
                "audio_type": audio_type,
                "slice_num": len(slices),
                "attachment_name": attachment_name,
                "mime_type": mime_type,
            },
            "stages": {
                "create": create_response.payload,
                "upload": upload_responses,
                "run": run_response.payload,
                "progress": progress_payloads,
                "result": result_response.payload,
            },
        }
        return _TransportResult(
            transcript=transcript,
            segments=segments,
            request_id=request_id,
            model=ASR_MODEL_NAME,
            meta=meta,
            raw=raw,
        )

    def _require_app_key(self) -> str:
        app_id = (self.settings.vivo_app_id or "").strip()
        app_key = self.settings.vivo_app_key.get_secret_value().strip() if self.settings.vivo_app_key else ""
        if not app_id or not app_key:
            raise ProviderConfigurationError("VIVO_APP_ID and VIVO_APP_KEY are required for vivo ASR requests")
        return app_key

    def _common_query_params(self, *, request_id: str, user_id: str) -> dict[str, Any]:
        return {
            "client_version": "unknown",
            "package": "unknown",
            "user_id": user_id,
            "system_time": int(time.time() * 1000),
            "engineid": ASR_ENGINE_ID,
            "requestId": request_id,
        }

    def _post_json(
        self,
        *,
        stage: str,
        path: str,
        app_key: str,
        query_params: dict[str, Any],
        body: dict[str, Any],
    ) -> _StageResponse:
        try:
            response = requests.post(
                self._url(path),
                params=query_params,
                headers={
                    "Authorization": f"Bearer {app_key}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json=body,
                timeout=self.settings.request_timeout_seconds,
            )
        except requests.Timeout as exc:
            raise VivoAsrTransportError(stage=stage, reason="timeout") from exc
        except requests.RequestException as exc:
            raise VivoAsrTransportError(stage=stage, reason=type(exc).__name__.lower()) from exc
        return self._validate_response(stage=stage, response=response)

    def _post_upload(
        self,
        *,
        stage: str,
        path: str,
        app_key: str,
        query_params: dict[str, Any],
        file_name: str,
        mime_type: str,
        content: bytes,
    ) -> _StageResponse:
        try:
            response = requests.post(
                self._url(path),
                params=query_params,
                headers={
                    "Authorization": f"Bearer {app_key}",
                },
                files={"file": (file_name, content, mime_type)},
                timeout=self.settings.request_timeout_seconds,
            )
        except requests.Timeout as exc:
            raise VivoAsrTransportError(stage=stage, reason="timeout") from exc
        except requests.RequestException as exc:
            raise VivoAsrTransportError(stage=stage, reason=type(exc).__name__.lower()) from exc
        return self._validate_response(stage=stage, response=response)

    def _validate_response(self, *, stage: str, response: requests.Response) -> _StageResponse:
        status_code = response.status_code
        if status_code in {401, 403}:
            raise ProviderAuthenticationError(f"Vivo ASR authentication failed with status {status_code}")
        payload = self._parse_json(response=response, stage=stage) if status_code < 400 else self._try_parse_json(response)
        if status_code >= 400:
            raise VivoAsrTransportError(
                stage=stage,
                reason="http-error",
                status_code=status_code,
                payload=payload,
            )

        business_code = _to_int(payload.get("code"))
        if business_code is None:
            raise VivoAsrTransportError(
                stage=stage,
                reason="missing-business-code",
                status_code=status_code,
                payload=payload,
            )
        if business_code != 0:
            raise VivoAsrTransportError(
                stage=stage,
                reason="business-error",
                status_code=status_code,
                business_code=business_code,
                payload=payload,
            )
        return _StageResponse(stage=stage, payload=payload, status_code=status_code)

    @staticmethod
    def _parse_json(*, response: requests.Response, stage: str) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception as exc:
            raise VivoAsrTransportError(stage=stage, reason=type(exc).__name__.lower()) from exc
        if not isinstance(payload, dict):
            raise VivoAsrTransportError(stage=stage, reason="invalid-json-payload")
        return payload

    @staticmethod
    def _try_parse_json(response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _require_string(container: object, key: str, *, stage: str) -> str:
        if isinstance(container, dict):
            value = _normalize_text(container.get(key))
            if value:
                return value
        raise VivoAsrTransportError(stage=stage, reason=f"missing-{key}")

    @staticmethod
    def _slice_audio(audio_bytes: bytes) -> list[bytes]:
        slices = [
            audio_bytes[index : index + ASR_UPLOAD_SLICE_BYTES]
            for index in range(0, len(audio_bytes), ASR_UPLOAD_SLICE_BYTES)
        ]
        if not slices:
            raise VivoAsrTransportError(stage="create", reason="empty-audio")
        if len(slices) > ASR_MAX_SLICES:
            raise VivoAsrTransportError(stage="create", reason="slice-limit-exceeded")
        return slices

    @staticmethod
    def _infer_audio_type(input: AsrProviderInput) -> str:
        mime_type = _normalize_text(input.mime_type).lower()
        attachment_name = _normalize_text(input.attachment_name).lower()
        suffix = Path(attachment_name).suffix.lower()
        if "pcm" in mime_type or suffix == ".pcm":
            return "pcm"
        return "auto"

    def _url(self, path: str) -> str:
        return f"{self.settings.vivo_base_url.rstrip('/')}{path}"


class VivoAsrProvider:
    provider_name = "vivo-asr"

    def __init__(self, settings: Settings):
        self.settings = settings
        self._mock_provider = MockAsrProvider()
        self._transport = VivoAsrTransport(settings)

    def transcribe(self, input: AsrProviderInput) -> ProviderResult[AsrTranscription]:
        transcript = _normalize_text(input.transcript)
        request_id = uuid4().hex
        if transcript:
            return ProviderResult(
                provider=self.provider_name,
                mode="mock",
                source="provided_transcript",
                model=ASR_MODEL_NAME,
                request_id=request_id,
                output=AsrTranscription(
                    transcript=transcript,
                    confidence=None,
                    meta=_build_meta(input, reason="provided-transcript"),
                    raw={"path": "provided_transcript"},
                    fallback=False,
                ),
            )

        if not input.audio_bytes:
            return self._fallback(
                input=input,
                request_id=request_id,
                reason="missing-audio-bytes",
                stage="create",
            )

        try:
            transport_result = self._transport.transcribe(input, request_id=request_id)
        except ProviderAuthenticationError:
            raise
        except ProviderConfigurationError as exc:
            if not self.settings.enable_mock_provider:
                raise
            return self._fallback(
                input=input,
                request_id=request_id,
                reason="missing-configuration",
                stage="create",
                raw={"error": str(exc)},
            )
        except VivoAsrTransportError as exc:
            return self._handle_transport_error(input=input, request_id=request_id, error=exc)

        return ProviderResult(
            provider=self.provider_name,
            mode="real",
            source="vivo",
            model=transport_result.model,
            request_id=transport_result.request_id,
            output=AsrTranscription(
                transcript=transport_result.transcript,
                confidence=None,
                segments=transport_result.segments,
                meta={
                    **_build_meta(input, reason="vivo-lasr-success"),
                    **transport_result.meta,
                },
                raw=transport_result.raw,
                fallback=False,
            ),
        )

    def _handle_transport_error(
        self,
        *,
        input: AsrProviderInput,
        request_id: str,
        error: VivoAsrTransportError,
    ) -> ProviderResult[AsrTranscription]:
        if not self.settings.enable_mock_provider:
            raise ProviderResponseError(str(error)) from error
        return self._fallback(
            input=input,
            request_id=request_id,
            reason=error.reason,
            stage=error.stage,
            status_code=error.status_code,
            business_code=error.business_code,
            raw=error.payload,
        )

    def _fallback(
        self,
        *,
        input: AsrProviderInput,
        request_id: str,
        reason: str,
        stage: str,
        status_code: int | None = None,
        business_code: int | None = None,
        raw: dict[str, Any] | None = None,
    ) -> ProviderResult[AsrTranscription]:
        mock_result = self._mock_provider.transcribe(input)
        fallback_raw = {
            "path": "vivo-asr-fallback",
            "stage": stage,
            "status_code": status_code,
            "business_code": business_code,
            "attempted_transport": ASR_TRANSPORT_NAME,
            "upstream": raw or {},
        }
        fallback_meta = {
            **_build_meta(input, reason=reason),
            "stage": stage,
            "status_code": status_code,
            "business_code": business_code,
            "attempted_provider": self.provider_name,
            "attempted_model": ASR_MODEL_NAME,
            "transport": ASR_TRANSPORT_NAME,
        }
        return ProviderResult(
            provider=self.provider_name,
            mode="mock",
            source="mock",
            model=ASR_MODEL_NAME,
            request_id=request_id,
            output=AsrTranscription(
                transcript=mock_result.output.transcript,
                confidence=mock_result.output.confidence,
                segments=None,
                meta=fallback_meta,
                raw=fallback_raw,
                fallback=True,
            ),
        )
