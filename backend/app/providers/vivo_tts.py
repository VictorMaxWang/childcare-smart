from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import logging
import secrets
import string
import time
import wave
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import quote, urlparse, urlunparse
from uuid import uuid4

from app.core.config import Settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
)

try:  # pragma: no cover - dependency availability is environment-specific
    from websockets.exceptions import InvalidStatus, WebSocketException
    from websockets.sync.client import connect
except ImportError:  # pragma: no cover - guarded at runtime
    InvalidStatus = WebSocketException = Exception
    connect = None


logger = logging.getLogger(__name__)

TTS_PATH = "/tts"
TTS_SAMPLE_RATE = 24_000
TTS_SAMPLE_WIDTH = 2
TTS_CHANNELS = 1
TTS_AUDIO_FORMAT = "audio/L16;rate=24000"
TTS_SIGNED_HEADERS = "x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce"
TTS_DEFAULT_ENGINE_ID = "short_audio_synthesis_jovi"
TTS_DEFAULT_VOICE_NAME = "yige"
TTS_DEFAULT_FALLBACK_VOICE_NAME = "vivoHelper"
TTS_DEFAULT_SPEED = 50
TTS_DEFAULT_VOLUME = 50
TTS_DEBUG_TEXT_LIMIT = 240
TTS_AUTH_MODE = "authorization-bearer-plus-x-ai-gateway-signature"
TTS_RUNTIME_METADATA_KEYS = (
    "model",
    "product",
    "package",
    "client_version",
    "system_version",
    "sdk_version",
    "android_version",
)
TTS_RUNTIME_PLACEHOLDER_VALUES = frozenset(
    {
        "",
        "unknown",
        "none",
        "null",
        "n/a",
        "na",
        "unset",
        "placeholder",
        "tbd",
        "todo",
    }
)


@dataclass(frozen=True, slots=True)
class TtsProfile:
    label: str
    engine_id: str
    voice_name: str


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _normalize_runtime_metadata_value(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized.casefold() in TTS_RUNTIME_PLACEHOLDER_VALUES:
        return ""
    return normalized


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _build_wav_bytes(pcm_bytes: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(TTS_CHANNELS)
        wav_file.setsampwidth(TTS_SAMPLE_WIDTH)
        wav_file.setframerate(TTS_SAMPLE_RATE)
        wav_file.writeframes(pcm_bytes)
    return buffer.getvalue()


def _to_websocket_base_url(base_url: str) -> str:
    parsed = urlparse(base_url.rstrip("/"))
    scheme = parsed.scheme.lower()
    if scheme == "https":
        parsed = parsed._replace(scheme="wss")
    elif scheme == "http":
        parsed = parsed._replace(scheme="ws")
    return urlunparse(parsed).rstrip("/")


def _quote_query_part(value: Any) -> str:
    return quote(str(value))


def _build_canonical_query_string(query: Mapping[str, Any]) -> str:
    if not query:
        return ""

    pairs: list[str] = []
    for raw_key in sorted(query.keys(), key=lambda item: str(item)):
        key = str(raw_key)
        value = query[raw_key]
        normalized_value = "" if value is None else str(value)
        pairs.append(f"{_quote_query_part(key)}={_quote_query_part(normalized_value)}")
    return "&".join(pairs)


def _generate_nonce(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


def _build_gateway_headers(
    *,
    app_id: str,
    app_key: str,
    method: str,
    uri: str,
    query: Mapping[str, Any],
    timestamp: str | None = None,
    nonce: str | None = None,
) -> dict[str, str]:
    normalized_method = method.upper()
    resolved_timestamp = timestamp or str(int(time.time()))
    resolved_nonce = nonce or _generate_nonce()
    canonical_query_string = _build_canonical_query_string(query)
    signed_headers_string = (
        f"x-ai-gateway-app-id:{app_id}\n"
        f"x-ai-gateway-timestamp:{resolved_timestamp}\n"
        f"x-ai-gateway-nonce:{resolved_nonce}"
    )
    signing_string = (
        f"{normalized_method}\n"
        f"{uri}\n"
        f"{canonical_query_string}\n"
        f"{app_id}\n"
        f"{resolved_timestamp}\n"
        f"{signed_headers_string}"
    ).encode("utf-8")
    signature = base64.b64encode(
        hmac.new(app_key.encode("utf-8"), signing_string, hashlib.sha256).digest()
    ).decode("utf-8")
    return {
        "X-AI-GATEWAY-APP-ID": app_id,
        "X-AI-GATEWAY-TIMESTAMP": resolved_timestamp,
        "X-AI-GATEWAY-NONCE": resolved_nonce,
        "X-AI-GATEWAY-SIGNED-HEADERS": TTS_SIGNED_HEADERS,
        "X-AI-GATEWAY-SIGNATURE": signature,
    }


def _mask_value(value: str, *, prefix: int = 4, suffix: int = 4) -> str:
    if not value:
        return value
    if len(value) <= prefix + suffix:
        return "*" * len(value)
    return f"{value[:prefix]}...{value[-suffix:]}"


def _truncate_debug_text(value: Any, *, limit: int = TTS_DEBUG_TEXT_LIMIT) -> str:
    normalized = _normalize_text(value)
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit]}..."


def _redact_query_value(key: str, value: Any) -> str:
    normalized_value = "" if value is None else str(value)
    if key.lower() == "user_id":
        return _mask_value(normalized_value)
    return normalized_value


def _build_redacted_query(query: Mapping[str, Any]) -> dict[str, str]:
    return {str(key): _redact_query_value(str(key), value) for key, value in query.items()}


def _build_redacted_ws_url(base_ws_url: str, query: Mapping[str, Any]) -> str:
    canonical_query = _build_canonical_query_string(_build_redacted_query(query))
    if not canonical_query:
        return base_ws_url
    return f"{base_ws_url}?{canonical_query}"


def _extract_response_status_code(response: Any) -> int | None:
    if response is None:
        return None
    for attr in ("status_code", "status"):
        raw_value = getattr(response, attr, None)
        if raw_value is None:
            continue
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            continue
    return None


def _extract_response_headers_summary(response: Any) -> dict[str, Any] | None:
    if response is None:
        return None

    headers = getattr(response, "headers", None)
    if headers is None:
        return None

    if isinstance(headers, Mapping):
        items = headers.items()
    elif hasattr(headers, "raw_items"):
        items = headers.raw_items()
    elif hasattr(headers, "items"):
        items = headers.items()
    else:
        return None

    interesting_keys = {"content-type", "content-length", "date", "server", "x-request-id"}
    interesting_headers: dict[str, str] = {}
    header_names: list[str] = []
    for raw_key, raw_value in items:
        key = str(raw_key).lower()
        header_names.append(key)
        if key in interesting_keys:
            interesting_headers[key] = _truncate_debug_text(raw_value, limit=120)

    if interesting_headers:
        return interesting_headers
    if header_names:
        return {"header_names": header_names[:12]}
    return None


def _extract_response_body_summary(response: Any) -> dict[str, Any] | str | None:
    if response is None:
        return None

    body = getattr(response, "body", None)
    if body is None:
        body = getattr(response, "text", None)
    if body is None:
        return None

    if isinstance(body, bytes):
        text = body.decode("utf-8", errors="replace")
    else:
        text = str(body)
    text = text.strip()
    if not text:
        return None

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return _truncate_debug_text(text)

    if not isinstance(payload, dict):
        return _truncate_debug_text(text)

    summary: dict[str, Any] = {}
    for key in ("error_code", "error_msg", "message", "sid", "req_id", "status", "trace_id", "traceId"):
        if key in payload:
            summary[key] = payload[key]

    data = payload.get("data")
    if isinstance(data, dict):
        data_summary = {
            key: data[key]
            for key in ("status", "progress", "slice")
            if key in data
        }
        if data_summary:
            summary["data"] = data_summary

    return summary or {"preview": _truncate_debug_text(text)}


def _attach_exception_context(exc: Exception, **attrs: Any) -> Exception:
    for key, value in attrs.items():
        setattr(exc, key, value)
    return exc


def _json_debug(summary: Mapping[str, Any]) -> str:
    return json.dumps(summary, ensure_ascii=False, sort_keys=True)


def _build_error_brief(summary: Mapping[str, Any]) -> str:
    parts = [
        f"profile={summary.get('profile')}",
        f"engine={summary.get('engine_id')}",
        f"voice={summary.get('voice_name')}",
    ]
    status_code = summary.get("status_code")
    if status_code is not None:
        parts.append(f"status={status_code}")
    error_code = summary.get("error_code")
    if error_code is not None:
        parts.append(f"error_code={error_code}")
    error_msg = summary.get("error_msg")
    if error_msg:
        parts.append(f"error={_truncate_debug_text(error_msg, limit=100)}")
    diagnosis = _normalize_text(summary.get("diagnosis"))
    if diagnosis:
        parts.append(f"diagnosis={diagnosis}")
    invalid_runtime_fields = summary.get("invalid_runtime_fields")
    if isinstance(invalid_runtime_fields, list) and invalid_runtime_fields:
        parts.append(f"runtime_fields={','.join(str(field) for field in invalid_runtime_fields)}")
    response_body = summary.get("response_body")
    if response_body:
        if isinstance(response_body, dict):
            body_message = response_body.get("error_msg") or response_body.get("message") or response_body.get("preview")
            if body_message:
                parts.append(f"body={_truncate_debug_text(body_message, limit=100)}")
        else:
            parts.append(f"body={_truncate_debug_text(response_body, limit=100)}")
    return ", ".join(parts)


class VivoTtsProvider:
    provider_name = "vivo-tts"

    def __init__(self, settings: Settings):
        self.settings = settings

    def synthesize(
        self,
        *,
        text: str,
        child_id: str | None = None,
        story_id: str | None = None,
        scene_index: int = 0,
        voice_style: str | None = None,
    ) -> dict[str, Any]:
        normalized_text = _normalize_text(text)
        if not normalized_text:
            raise ProviderResponseError("Vivo TTS requires non-empty text")

        app_id, app_key = self._require_credentials()
        request_id = uuid4().hex
        profiles = self._profiles()
        last_error: Exception | None = None

        for profile_index, profile in enumerate(profiles):
            try:
                return self._synthesize_once(
                    app_id=app_id,
                    app_key=app_key,
                    request_id=request_id,
                    text=normalized_text,
                    child_id=child_id,
                    story_id=story_id,
                    scene_index=scene_index,
                    voice_style=voice_style,
                    profile=profile,
                )
            except (ProviderAuthenticationError, ProviderConfigurationError):
                raise
            except ProviderResponseError as exc:
                last_error = exc
                if profile_index < len(profiles) - 1:
                    logger.warning(
                        "Vivo TTS profile failed, retrying fallback: %s",
                        _truncate_debug_text(str(exc), limit=220),
                    )
                    continue
                break

        if last_error:
            raise last_error
        raise ProviderResponseError("Vivo TTS failed without returning an explicit error")

    def _synthesize_once(
        self,
        *,
        app_id: str,
        app_key: str,
        request_id: str,
        text: str,
        child_id: str | None,
        story_id: str | None,
        scene_index: int,
        voice_style: str | None,
        profile: TtsProfile,
    ) -> dict[str, Any]:
        if connect is None:
            raise ProviderConfigurationError("websockets package is required for vivo TTS")

        system_time = str(int(time.time()))
        runtime_metadata = self._runtime_metadata_query()
        invalid_runtime_fields = [key for key, value in runtime_metadata.items() if not value]
        query = {
            "engineid": profile.engine_id,
            "system_time": system_time,
            "user_id": self._build_user_id(child_id=child_id, story_id=story_id, scene_index=scene_index),
            "requestId": request_id,
        }
        query.update(runtime_metadata)
        base_ws_url = f"{_to_websocket_base_url(self.settings.vivo_base_url)}{TTS_PATH}"
        ws_url = f"{base_ws_url}?{_build_canonical_query_string(query)}"
        headers = _build_gateway_headers(
            app_id=app_id,
            app_key=app_key,
            method="GET",
            uri=TTS_PATH,
            query=query,
            timestamp=system_time,
        )
        headers["Authorization"] = f"Bearer {app_key}"
        handshake_context = {
            "profile": profile.label,
            "engine_id": profile.engine_id,
            "voice_name": profile.voice_name,
            "ws_url": _build_redacted_ws_url(base_ws_url, query),
            "query": _build_redacted_query(query),
            "query_keys": sorted(query.keys()),
            "auth_mode": TTS_AUTH_MODE,
            "auth_header_names": sorted(headers.keys()),
            "runtime_metadata": runtime_metadata,
            "invalid_runtime_fields": invalid_runtime_fields,
        }

        try:
            with connect(
                ws_url,
                additional_headers=headers,
                open_timeout=self.settings.request_timeout_seconds,
                close_timeout=self.settings.request_timeout_seconds,
                max_size=None,
            ) as websocket:
                payload = {
                    "aue": 0,
                    "auf": TTS_AUDIO_FORMAT,
                    "vcn": profile.voice_name,
                    "text": base64.b64encode(text.encode("utf-8")).decode("utf-8"),
                    "encoding": "utf8",
                    "reqId": self._build_numeric_req_id(request_id),
                }
                if self.settings.storybook_tts_speed != TTS_DEFAULT_SPEED:
                    payload["speed"] = self.settings.storybook_tts_speed
                if self.settings.storybook_tts_volume != TTS_DEFAULT_VOLUME:
                    payload["volume"] = self.settings.storybook_tts_volume
                websocket.send(json.dumps(payload, ensure_ascii=False))

                pcm_chunks: list[bytes] = []
                while True:
                    frame = self._recv_json(websocket, timeout=self.settings.request_timeout_seconds)
                    error_code = int(frame.get("error_code") or 0)
                    if error_code != 0:
                        error_msg = _normalize_text(frame.get("error_msg")) or str(error_code)
                        raise _attach_exception_context(
                            ProviderResponseError(f"Vivo TTS synthesis failed: {error_msg}"),
                            error_code=error_code,
                            error_msg=error_msg,
                            profile=profile.label,
                            engine_id=profile.engine_id,
                            voice_name=profile.voice_name,
                        )

                    data = frame.get("data")
                    if data is None:
                        continue
                    if not isinstance(data, dict):
                        raise ProviderResponseError("Vivo TTS returned invalid frame data")

                    audio_chunk = data.get("audio")
                    if audio_chunk:
                        if not isinstance(audio_chunk, str):
                            raise ProviderResponseError("Vivo TTS returned invalid audio chunk")
                        pcm_chunks.append(base64.b64decode(audio_chunk))

                    status = int(data.get("status") or 0)
                    if status == 2:
                        break

                pcm_bytes = b"".join(pcm_chunks)
                if not pcm_bytes:
                    raise ProviderResponseError("Vivo TTS finished without audio data")
                wav_bytes = _build_wav_bytes(pcm_bytes)

                return {
                    "provider": self.provider_name,
                    "mode": "live",
                    "audioUrl": f"data:audio/wav;base64,{base64.b64encode(wav_bytes).decode('utf-8')}",
                    "audioRef": f"vivo-tts-{request_id}",
                    "audioScript": text,
                    "voiceStyle": voice_style or profile.voice_name,
                    "engineId": profile.engine_id,
                    "voiceName": profile.voice_name,
                    "profileLabel": profile.label,
                    "requestId": request_id,
                    "appId": app_id,
                    "audioBytes": wav_bytes,
                    "audioContentType": "audio/wav",
                }
        except InvalidStatus as exc:
            response = getattr(exc, "response", None)
            status_code = _extract_response_status_code(response)
            response_headers = _extract_response_headers_summary(response)
            response_body = _extract_response_body_summary(response)
            diagnosis = self._diagnose_handshake_failure(
                status_code=status_code,
                response_body=response_body,
                invalid_runtime_fields=invalid_runtime_fields,
            )
            summary = {
                **handshake_context,
                "stage": "http_handshake",
                "status_code": status_code,
                "response_headers": response_headers,
                "response_body": response_body,
                "diagnosis": diagnosis,
                "error_code": self._extract_summary_field(response_body, "error_code"),
                "error_msg": self._extract_error_message(response_body),
            }
            log_level = logging.ERROR if status_code in {401, 403} else logging.WARNING
            logger.log(log_level, "Vivo TTS websocket handshake failed: %s", _json_debug(summary))

            if status_code in {401, 403}:
                raise _attach_exception_context(
                    ProviderAuthenticationError(
                        f"Vivo TTS authentication failed with status {status_code}; {_build_error_brief(summary)}"
                    ),
                    http_status=status_code,
                    profile=profile.label,
                    engine_id=profile.engine_id,
                    voice_name=profile.voice_name,
                    diagnosis=diagnosis,
                    invalid_runtime_fields=invalid_runtime_fields,
                    runtime_metadata=runtime_metadata,
                    debug=summary,
                ) from exc

            raise _attach_exception_context(
                ProviderResponseError(
                    f"Vivo TTS websocket handshake failed with status {status_code}; {_build_error_brief(summary)}"
                ),
                http_status=status_code,
                profile=profile.label,
                engine_id=profile.engine_id,
                voice_name=profile.voice_name,
                diagnosis=diagnosis,
                invalid_runtime_fields=invalid_runtime_fields,
                runtime_metadata=runtime_metadata,
                error_code=summary.get("error_code"),
                error_msg=summary.get("error_msg"),
                response_headers=response_headers,
                response_body=response_body,
                debug=summary,
            ) from exc
        except TimeoutError as exc:
            raise _attach_exception_context(
                ProviderResponseError(
                    f"Vivo TTS timed out; profile={profile.label}, engine={profile.engine_id}, voice={profile.voice_name}"
                ),
                profile=profile.label,
                engine_id=profile.engine_id,
                voice_name=profile.voice_name,
            ) from exc
        except WebSocketException as exc:
            raise _attach_exception_context(
                ProviderResponseError(
                    f"Vivo TTS websocket error: {type(exc).__name__}; "
                    f"profile={profile.label}, engine={profile.engine_id}, voice={profile.voice_name}"
                ),
                profile=profile.label,
                engine_id=profile.engine_id,
                voice_name=profile.voice_name,
            ) from exc
        except OSError as exc:
            raise _attach_exception_context(
                ProviderResponseError(
                    f"Vivo TTS transport error: {type(exc).__name__}; "
                    f"profile={profile.label}, engine={profile.engine_id}, voice={profile.voice_name}"
                ),
                profile=profile.label,
                engine_id=profile.engine_id,
                voice_name=profile.voice_name,
            ) from exc

    def _require_credentials(self) -> tuple[str, str]:
        app_id = (self.settings.vivo_app_id or "").strip()
        app_key = self.settings.vivo_app_key.get_secret_value().strip() if self.settings.vivo_app_key else ""
        if not app_id or not app_key:
            raise ProviderConfigurationError("VIVO_APP_ID and VIVO_APP_KEY are required for vivo TTS")
        return app_id, app_key

    def _profiles(self) -> list[TtsProfile]:
        primary = TtsProfile(
            label="primary",
            engine_id=_normalize_text(self.settings.storybook_tts_engineid) or TTS_DEFAULT_ENGINE_ID,
            voice_name=_normalize_text(self.settings.storybook_tts_voice) or TTS_DEFAULT_VOICE_NAME,
        )
        fallback = TtsProfile(
            label="fallback",
            engine_id=_normalize_text(self.settings.storybook_tts_fallback_engineid) or primary.engine_id,
            voice_name=_normalize_text(self.settings.storybook_tts_fallback_voice) or TTS_DEFAULT_FALLBACK_VOICE_NAME,
        )

        profiles: list[TtsProfile] = []
        seen: set[tuple[str, str]] = set()
        for profile in (primary, fallback):
            key = (profile.engine_id, profile.voice_name)
            if not profile.engine_id or not profile.voice_name or key in seen:
                continue
            seen.add(key)
            profiles.append(profile)
        return profiles

    def _runtime_metadata_query(self) -> dict[str, str]:
        return {
            "model": _normalize_runtime_metadata_value(self.settings.storybook_tts_model),
            "product": _normalize_runtime_metadata_value(self.settings.storybook_tts_product),
            "package": _normalize_runtime_metadata_value(self.settings.storybook_tts_package),
            "client_version": _normalize_runtime_metadata_value(self.settings.storybook_tts_client_version),
            "system_version": _normalize_runtime_metadata_value(self.settings.storybook_tts_system_version),
            "sdk_version": _normalize_runtime_metadata_value(self.settings.storybook_tts_sdk_version),
            "android_version": _normalize_runtime_metadata_value(self.settings.storybook_tts_android_version),
        }

    @staticmethod
    def _extract_summary_field(summary: dict[str, Any] | str | None, key: str) -> Any:
        if isinstance(summary, dict):
            return summary.get(key)
        return None

    @classmethod
    def _extract_error_message(cls, summary: dict[str, Any] | str | None) -> str | None:
        if isinstance(summary, dict):
            for key in ("error_msg", "message", "preview"):
                value = _normalize_text(summary.get(key))
                if value:
                    return value
        elif isinstance(summary, str):
            value = _normalize_text(summary)
            if value:
                return value
        return None

    @classmethod
    def _diagnose_handshake_failure(
        cls,
        *,
        status_code: int | None,
        response_body: dict[str, Any] | str | None,
        invalid_runtime_fields: list[str],
    ) -> str | None:
        error_message = (cls._extract_error_message(response_body) or "").casefold()
        if status_code in {401, 403}:
            return "auth_failed"
        if any(token in error_message for token in ("package", "product", "client_version", "sdk_version", "android_version")):
            if invalid_runtime_fields:
                return "runtime_profile_missing_or_placeholder"
            return "runtime_profile_rejected"
        if status_code == 400 and invalid_runtime_fields:
            return "runtime_profile_missing_or_placeholder"
        if status_code == 400:
            return "bad_request"
        return None

    @staticmethod
    def _recv_json(websocket: Any, *, timeout: float) -> dict[str, Any]:
        raw = websocket.recv(timeout=timeout)
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if not isinstance(raw, str):
            raise ProviderResponseError("Vivo TTS frame is not text JSON")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProviderResponseError("Vivo TTS returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise ProviderResponseError("Vivo TTS frame is not a JSON object")
        return payload

    @staticmethod
    def _build_user_id(*, child_id: str | None, story_id: str | None, scene_index: int) -> str:
        seed = "::".join(
            [
                _normalize_text(child_id) or "child",
                _normalize_text(story_id) or "story",
                str(scene_index + 1),
            ]
        )
        return _stable_hash(seed)[:32]

    @staticmethod
    def _build_numeric_req_id(request_id: str) -> int:
        return int(request_id[:12], 16)
