from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import random
import string
import time
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import requests

from app.core.config import Settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
    ProviderTextResult,
)
from app.providers.mock import MockTextProvider

DEFAULT_SYSTEM_PROMPT = "You are the SmartChildcare AI assistant. Respond in concise, actionable Chinese for a mobile UI."
DEFAULT_APP_ID_CARRIER = "query"
SUPPORTED_APP_ID_CARRIERS = ("query", "body", "header")
APP_ID_HEADER_NAME = "app_id"
REQUEST_ID_QUERY_KEY = "requestId"
SIGNATURE_MODE = "gateway_headers_v1"
SIGNED_HEADERS = "x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce"
GATEWAY_NONCE_LENGTH = 8


def _auth_shape_for_carrier(app_id_carrier: str) -> str:
    return f"authorization_bearer_plus_gateway_signature_headers_plus_{app_id_carrier}_app_id"


AUTH_SHAPE = _auth_shape_for_carrier(DEFAULT_APP_ID_CARRIER)


@dataclass(frozen=True)
class VivoLlmRequestShape:
    endpoint_path: str
    uri: str
    query_params: dict[str, Any]
    payload: dict[str, Any]
    headers: dict[str, str]
    auth_shape: str
    app_id_carrier: str
    request_id_key: str
    signature_mode: str


class VivoLlmProviderError(RuntimeError):
    """Raised when the vivo LLM provider cannot satisfy a request safely."""


class VivoLlmProvider:
    provider_name = "vivo-llm"

    def __init__(self, settings: Settings, *, app_id_carrier: str = DEFAULT_APP_ID_CARRIER) -> None:
        if app_id_carrier not in SUPPORTED_APP_ID_CARRIERS:
            raise ValueError(f"unsupported app_id_carrier: {app_id_carrier}")
        self.settings = settings
        self.app_id_carrier = app_id_carrier
        self._mock_provider = MockTextProvider()

    def _request_id(self) -> str:
        return uuid4().hex

    def _require_credentials(self) -> tuple[str, str]:
        app_id = (self.settings.vivo_app_id or "").strip()
        app_key = self.settings.vivo_app_key.get_secret_value().strip() if self.settings.vivo_app_key else ""
        if not app_id or not app_key:
            raise ProviderConfigurationError("VIVO_APP_ID and VIVO_APP_KEY are required for vivo text requests")
        return app_id, app_key

    def _build_request_shape(self, *, app_id: str, app_key: str, prompt: str, request_id: str) -> VivoLlmRequestShape:
        endpoint_path = "/chat/completions"
        uri = "/v1/chat/completions"
        query_params: dict[str, Any] = {REQUEST_ID_QUERY_KEY: request_id}
        payload: dict[str, Any] = {
            "model": self.settings.vivo_llm_model,
            "stream": False,
            "messages": [
                {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }
        headers: dict[str, str] = {
            "Authorization": f"Bearer {app_key}",
            "Content-Type": "application/json; charset=utf-8",
        }

        if self.app_id_carrier == "query":
            query_params["app_id"] = app_id
        elif self.app_id_carrier == "body":
            payload["app_id"] = app_id
        else:
            headers[APP_ID_HEADER_NAME] = app_id

        headers.update(
            self._build_gateway_headers(
                app_id=app_id,
                app_key=app_key,
                method="POST",
                uri=uri,
                query=query_params,
            )
        )

        return VivoLlmRequestShape(
            endpoint_path=endpoint_path,
            uri=uri,
            query_params=query_params,
            payload=payload,
            headers=headers,
            auth_shape=_auth_shape_for_carrier(self.app_id_carrier),
            app_id_carrier=self.app_id_carrier,
            request_id_key=REQUEST_ID_QUERY_KEY,
            signature_mode=SIGNATURE_MODE,
        )

    @staticmethod
    def _gen_nonce(length: int = GATEWAY_NONCE_LENGTH) -> str:
        charset = string.ascii_lowercase + string.digits
        return "".join(random.choice(charset) for _ in range(length))

    @staticmethod
    def _canonical_query_string(params: dict[str, Any]) -> str:
        if not params:
            return ""
        return "&".join(f"{quote(str(key), safe='')}={quote(str(params[key]), safe='')}" for key in sorted(params))

    @classmethod
    def _build_gateway_headers(
        cls,
        *,
        app_id: str,
        app_key: str,
        method: str,
        uri: str,
        query: dict[str, Any],
    ) -> dict[str, str]:
        timestamp = str(int(time.time()))
        nonce = cls._gen_nonce()
        canonical_query = cls._canonical_query_string(query)
        signed_headers_string = (
            f"x-ai-gateway-app-id:{app_id}\n"
            f"x-ai-gateway-timestamp:{timestamp}\n"
            f"x-ai-gateway-nonce:{nonce}"
        )
        signing_string = "\n".join(
            [
                method.upper(),
                uri,
                canonical_query,
                app_id,
                timestamp,
                signed_headers_string,
            ]
        ).encode("utf-8")
        signature = base64.b64encode(
            hmac.new(app_key.encode("utf-8"), signing_string, hashlib.sha256).digest()
        ).decode("utf-8")
        return {
            "X-AI-GATEWAY-APP-ID": app_id,
            "X-AI-GATEWAY-TIMESTAMP": timestamp,
            "X-AI-GATEWAY-NONCE": nonce,
            "X-AI-GATEWAY-SIGNED-HEADERS": SIGNED_HEADERS,
            "X-AI-GATEWAY-SIGNATURE": signature,
        }

    @staticmethod
    def _try_parse_json(response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _extract_error_fields(payload: dict[str, Any]) -> tuple[int | str | None, str | None, str | None]:
        error_code = payload.get("error_code")
        if error_code is None:
            error_code = payload.get("code")
        message = payload.get("error_msg")
        if message is None:
            message = payload.get("message")
        if message is None:
            message = payload.get("msg")
        if message is None:
            error = payload.get("error")
            if isinstance(error, str):
                message = error
            elif isinstance(error, dict):
                message = error.get("message") or error.get("error_msg") or error.get("msg")
        trace_id = payload.get("trace_id") or payload.get("traceId")
        return error_code, message, trace_id

    @staticmethod
    def _shape_details(request_shape: VivoLlmRequestShape | None) -> dict[str, str]:
        if request_shape is None:
            return {
                "auth_shape": AUTH_SHAPE,
                "app_id_carrier": DEFAULT_APP_ID_CARRIER,
                "request_id_key": REQUEST_ID_QUERY_KEY,
                "signature_mode": SIGNATURE_MODE,
            }
        return {
            "auth_shape": request_shape.auth_shape,
            "app_id_carrier": request_shape.app_id_carrier,
            "request_id_key": request_shape.request_id_key,
            "signature_mode": request_shape.signature_mode,
        }

    @classmethod
    def _diagnose_upstream_error(
        cls,
        *,
        status_code: int | None,
        error_code: int | str | None,
        error_msg: str | None,
    ) -> tuple[str, str]:
        normalized_msg = (error_msg or "").strip().lower()
        normalized_code = str(error_code).strip() if error_code is not None else ""

        if status_code == 429 or "rate limit" in normalized_msg:
            return "response", "rate_limited"
        if normalized_code == "40100" or "missing required app_id" in normalized_msg:
            return "auth", "app_id_missing"
        if normalized_code == "40101" or "missing required signature" in normalized_msg or "invalid signature" in normalized_msg:
            return "auth", "signature_invalid_or_missing"
        if normalized_code == "40102" or "invalid app_id" in normalized_msg:
            return "auth", "app_id_invalid_or_mismatched"
        if "invalid api-key" in normalized_msg or "invalid api key" in normalized_msg:
            return "auth", "app_key_invalid"
        if normalized_code == "30001" and (
            "permission" in normalized_msg or "ability" in normalized_msg or "expire" in normalized_msg
        ):
            return "permission", "model_permission_missing"
        if (
            status_code == 403
            or "not having this ability" in normalized_msg
            or "no model access permission" in normalized_msg
            or ("model" in normalized_msg and "permission" in normalized_msg)
        ):
            return "permission", "model_permission_missing"
        return "response", "unknown_upstream_error"

    @classmethod
    def _build_error_message(
        cls,
        *,
        status_code: int | None,
        diagnosis: str,
        error_code: int | str | None,
        error_msg: str | None,
        trace_id: str | None,
    ) -> str:
        parts = [f"Vivo LLM request failed: diagnosis={diagnosis}"]
        if status_code is not None:
            parts.append(f"status={status_code}")
        if error_code is not None:
            parts.append(f"error_code={error_code}")
        if error_msg:
            parts.append(f"error_msg={error_msg}")
        if trace_id:
            parts.append(f"trace_id={trace_id}")
        return ", ".join(parts)

    @classmethod
    def _attach_error_details(
        cls,
        error: ProviderAuthenticationError | ProviderResponseError,
        *,
        status_code: int | None,
        error_code: int | str | None,
        error_msg: str | None,
        trace_id: str | None,
        diagnosis: str,
        kind: str,
        request_id: str,
        raw: dict[str, Any] | None,
        request_shape: VivoLlmRequestShape | None,
    ) -> ProviderAuthenticationError | ProviderResponseError:
        shape_details = cls._shape_details(request_shape)
        error.http_status = status_code
        error.error_code = error_code
        error.error_msg = error_msg
        error.trace_id = trace_id
        error.diagnosis = diagnosis
        error.kind = kind
        error.request_id = request_id
        error.raw = raw or {}
        error.auth_shape = shape_details["auth_shape"]
        error.app_id_carrier = shape_details["app_id_carrier"]
        error.request_id_key = shape_details["request_id_key"]
        error.signature_mode = shape_details["signature_mode"]
        return error

    def _raise_upstream_error(
        self,
        *,
        status_code: int | None,
        request_id: str,
        raw: dict[str, Any] | None,
        request_shape: VivoLlmRequestShape | None,
    ) -> None:
        payload = raw or {}
        error_code, error_msg, trace_id = self._extract_error_fields(payload)
        kind, diagnosis = self._diagnose_upstream_error(
            status_code=status_code,
            error_code=error_code,
            error_msg=error_msg,
        )
        message = self._build_error_message(
            status_code=status_code,
            diagnosis=diagnosis,
            error_code=error_code,
            error_msg=error_msg,
            trace_id=trace_id,
        )
        error_cls = ProviderAuthenticationError if kind == "auth" else ProviderResponseError
        raise self._attach_error_details(
            error_cls(message),
            status_code=status_code,
            error_code=error_code,
            error_msg=error_msg,
            trace_id=trace_id,
            diagnosis=diagnosis,
            kind=kind,
            request_id=request_id,
            raw=payload,
            request_shape=request_shape,
        )

    def _fallback(
        self,
        *,
        fallback: str,
        request_id: str,
        reason: str,
        status_code: int | None = None,
        raw: dict[str, Any] | None = None,
        latency_ms: int | None = None,
        diagnosis: str | None = None,
        kind: str = "response",
        request_shape: VivoLlmRequestShape | None = None,
    ) -> ProviderTextResult:
        shape_details = self._shape_details(request_shape)
        error_code, error_msg, trace_id = self._extract_error_fields(raw or {})
        if diagnosis is None:
            kind, diagnosis = self._diagnose_upstream_error(
                status_code=status_code,
                error_code=error_code,
                error_msg=error_msg,
            )
        if not self.settings.enable_mock_provider:
            message = self._build_error_message(
                status_code=status_code,
                diagnosis=diagnosis,
                error_code=error_code,
                error_msg=error_msg or reason,
                trace_id=trace_id,
            )
            raise self._attach_error_details(
                ProviderResponseError(message),
                status_code=status_code,
                error_code=error_code,
                error_msg=error_msg or reason,
                trace_id=trace_id,
                diagnosis=diagnosis,
                kind=kind,
                request_id=request_id,
                raw=raw,
                request_shape=request_shape,
            )

        result = self._mock_provider.summarize(prompt="", fallback=fallback)
        result.provider = self.provider_name
        result.source = "mock"
        result.fallback = True
        result.request_id = request_id
        result.meta = {
            "reason": reason,
            "diagnosis": diagnosis,
            "kind": kind,
            "status_code": status_code,
            "error_code": error_code,
            "error_msg": error_msg,
            "trace_id": trace_id,
            "latency_ms": latency_ms,
            "attempted_provider": self.provider_name,
            "attempted_model": self.settings.vivo_llm_model,
            **shape_details,
        }
        result.raw = raw
        return result

    def summarize(self, prompt: str, fallback: str) -> ProviderTextResult:
        app_id, app_key = self._require_credentials()
        request_id = self._request_id()
        started_at = time.perf_counter()
        request_shape = self._build_request_shape(
            app_id=app_id,
            app_key=app_key,
            prompt=prompt,
            request_id=request_id,
        )

        try:
            response = requests.post(
                f"{self.settings.vivo_llm_base_url.rstrip('/')}{request_shape.endpoint_path}",
                params=request_shape.query_params,
                headers=request_shape.headers,
                json=request_shape.payload,
                timeout=self.settings.request_timeout_seconds,
            )
        except requests.Timeout:
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason="timeout",
                latency_ms=self._latency_ms(started_at),
                diagnosis="network_or_timeout",
                request_shape=request_shape,
            )
        except requests.RequestException as error:
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason=type(error).__name__.lower(),
                latency_ms=self._latency_ms(started_at),
                diagnosis="network_or_timeout",
                request_shape=request_shape,
            )

        error_payload = self._try_parse_json(response)
        if response.status_code in {401, 403}:
            self._raise_upstream_error(
                status_code=response.status_code,
                request_id=request_id,
                raw=error_payload,
                request_shape=request_shape,
            )
        if response.status_code == 429:
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason="rate-limited",
                status_code=response.status_code,
                raw=error_payload,
                latency_ms=self._latency_ms(started_at),
                diagnosis="rate_limited",
                request_shape=request_shape,
            )
        if response.status_code >= 500:
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason="upstream-server-error",
                status_code=response.status_code,
                raw=error_payload,
                latency_ms=self._latency_ms(started_at),
                request_shape=request_shape,
            )
        if response.status_code >= 400:
            self._raise_upstream_error(
                status_code=response.status_code,
                request_id=request_id,
                raw=error_payload,
                request_shape=request_shape,
            )

        try:
            payload = response.json()
        except Exception as error:  # pragma: no cover - defensive path
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason=type(error).__name__.lower(),
                latency_ms=self._latency_ms(started_at),
                request_shape=request_shape,
            )
        if not isinstance(payload, dict):
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason="invalid-json-payload",
                latency_ms=self._latency_ms(started_at),
                request_shape=request_shape,
            )
        if payload.get("error_code") is not None or (
            (payload.get("error_msg") or payload.get("message") or payload.get("msg")) and not payload.get("choices")
        ):
            self._raise_upstream_error(
                status_code=response.status_code,
                request_id=request_id,
                raw=payload,
                request_shape=request_shape,
            )

        choices = payload.get("choices")
        first_choice = choices[0] if isinstance(choices, list) and choices else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        content = message.get("content") if isinstance(message, dict) else None
        text = self._extract_text_content(content)
        if not text:
            return self._fallback(
                fallback=fallback,
                request_id=request_id,
                reason="empty-content",
                raw=payload if isinstance(payload, dict) else None,
                latency_ms=self._latency_ms(started_at),
                request_shape=request_shape,
            )

        return ProviderTextResult(
            text=text,
            content=text,
            source="vivo",
            model=str(payload.get("model") or self.settings.vivo_llm_model),
            provider=self.provider_name,
            usage=payload.get("usage"),
            meta={
                "finish_reason": first_choice.get("finish_reason") if isinstance(first_choice, dict) else None,
                "status_code": response.status_code,
                "latency_ms": self._latency_ms(started_at),
                "upstream_id": payload.get("id"),
                "created": payload.get("created"),
                "tool_call_count": len(message.get("tool_calls", [])) if isinstance(message, dict) and isinstance(message.get("tool_calls"), list) else 0,
                "diagnosis": "auth_ok",
                **self._shape_details(request_shape),
            },
            raw=payload,
            fallback=False,
            request_id=request_id,
        )

    @staticmethod
    def _extract_text_content(content: object) -> str:
        if isinstance(content, str):
            return content.strip()
        if not isinstance(content, list):
            return ""

        parts: list[str] = []
        for item in content:
            if isinstance(item, str) and item.strip():
                parts.append(item.strip())
                continue
            if not isinstance(item, dict):
                continue
            text_value = item.get("text")
            if isinstance(text_value, str) and text_value.strip():
                parts.append(text_value.strip())
                continue
            if isinstance(text_value, dict):
                nested_value = text_value.get("value")
                if isinstance(nested_value, str) and nested_value.strip():
                    parts.append(nested_value.strip())

        return "\n".join(parts).strip()

    @staticmethod
    def _latency_ms(started_at: float) -> int:
        return int((time.perf_counter() - started_at) * 1000)
