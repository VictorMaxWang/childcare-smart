from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
)
from app.providers.resolver import (
    can_use_vivo_text_provider,
    has_vivo_text_provider_config,
    resolve_text_provider,
)
from app.providers.vivo_llm import (
    AUTH_SHAPE,
    DEFAULT_APP_ID_CARRIER,
    REQUEST_ID_QUERY_KEY,
    SIGNATURE_MODE,
    SUPPORTED_APP_ID_CARRIERS,
    VivoLlmProvider,
)

DEFAULT_PROMPT = "Please return one concise Chinese sentence for the SmartChildcare vivo LLM smoke test."
DEFAULT_FALLBACK = "smoke fallback triggered"
STRICT_CONFIG_ERROR = "strict smoke requires BRAIN_PROVIDER=vivo and both VIVO_APP_ID/VIVO_APP_KEY."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a direct vivo LLM smoke test without Next.js fallback.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--strict", dest="strict", action="store_true", help="Require a live vivo result.")
    group.add_argument(
        "--allow-fallback",
        dest="strict",
        action="store_false",
        help="Allow mock fallback when vivo is unavailable.",
    )
    parser.set_defaults(strict=True)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt sent to the provider.")
    parser.add_argument("--fallback", default=DEFAULT_FALLBACK, help="Fallback text used by the provider.")
    parser.add_argument("--include-raw", action="store_true", help="Include raw upstream JSON in the output.")
    parser.add_argument(
        "--app-id-carrier",
        choices=SUPPORTED_APP_ID_CARRIERS,
        default=DEFAULT_APP_ID_CARRIER,
        help="Experiment with explicit app_id transport while keeping the rest of the auth shape stable.",
    )
    return parser.parse_args()


def build_output(result: Any, *, include_raw: bool, brain_provider: str, vivo_credentials_configured: bool) -> dict[str, Any]:
    raw = result.raw if isinstance(result.raw, dict) else {}
    meta = result.meta if isinstance(result.meta, dict) else {}
    provider_source = result.source
    provider_model = result.model
    fallback_reason = meta.get("reason")
    output = {
        "ok": True,
        "brain_provider": brain_provider,
        "vivo_credentials_configured": vivo_credentials_configured,
        "provider": result.provider,
        "source": result.source,
        "model": result.model,
        "provider_source": provider_source,
        "provider_model": provider_model,
        "fallback": result.fallback,
        "real_provider": provider_source == "vivo" and not result.fallback,
        "fallback_reason": fallback_reason,
        "request_id": result.request_id,
        "usage": result.usage,
        "meta": meta,
        "auth_shape": meta.get("auth_shape") or AUTH_SHAPE,
        "app_id_carrier": meta.get("app_id_carrier") or DEFAULT_APP_ID_CARRIER,
        "request_id_key": meta.get("request_id_key") or REQUEST_ID_QUERY_KEY,
        "signature_mode": meta.get("signature_mode") or SIGNATURE_MODE,
        "diagnosis": meta.get("diagnosis") or "auth_ok",
        "http_status": meta.get("status_code"),
        "error_code": meta.get("error_code"),
        "error_msg": meta.get("error_msg"),
        "trace_id": meta.get("trace_id"),
        "upstream_markers": {
            "id": raw.get("id"),
            "created": raw.get("created"),
        },
        "upstream_status_code": meta.get("status_code"),
        "content_preview": (result.content or "")[:160],
    }
    if include_raw:
        output["raw"] = raw
    return output


def extract_error_details(exc: Exception) -> dict[str, Any]:
    error_msg = getattr(exc, "error_msg", None)
    diagnosis = getattr(exc, "diagnosis", None)
    kind = getattr(exc, "kind", None)
    if diagnosis is None:
        message = str(exc).lower()
        if "timeout" in message:
            diagnosis = "network_or_timeout"
        elif "network" in message or "connection" in message:
            diagnosis = "network_or_timeout"
        elif "missing required app_id" in message:
            diagnosis = "app_id_missing"
        elif "invalid app_id" in message:
            diagnosis = "app_id_invalid_or_mismatched"
        elif "missing required signature" in message or "invalid signature" in message:
            diagnosis = "signature_invalid_or_missing"
        elif "invalid api-key" in message or "invalid api key" in message:
            diagnosis = "app_key_invalid"
        elif "not having this ability" in message or ("model" in message and "permission" in message):
            diagnosis = "model_permission_missing"
        else:
            diagnosis = "unknown_upstream_error"
    if kind is None:
        if diagnosis in {"app_id_missing", "app_id_invalid_or_mismatched", "signature_invalid_or_missing", "app_key_invalid"}:
            kind = "auth"
        elif diagnosis == "model_permission_missing":
            kind = "permission"
        elif diagnosis == "network_or_timeout":
            kind = "network"
        else:
            kind = "response"
    return {
        "kind": kind,
        "diagnosis": diagnosis,
        "http_status": getattr(exc, "http_status", None),
        "error_code": getattr(exc, "error_code", None),
        "error_msg": error_msg,
        "trace_id": getattr(exc, "trace_id", None),
        "request_id": getattr(exc, "request_id", None),
        "auth_shape": getattr(exc, "auth_shape", AUTH_SHAPE),
        "app_id_carrier": getattr(exc, "app_id_carrier", DEFAULT_APP_ID_CARRIER),
        "request_id_key": getattr(exc, "request_id_key", REQUEST_ID_QUERY_KEY),
        "signature_mode": getattr(exc, "signature_mode", SIGNATURE_MODE),
        "raw": getattr(exc, "raw", None),
    }


def build_error_output(
    *,
    error: str,
    kind: str,
    brain_provider: str,
    vivo_credentials_configured: bool,
    diagnosis: str | None = None,
    http_status: int | None = None,
    error_code: int | str | None = None,
    error_msg: str | None = None,
    trace_id: str | None = None,
    request_id: str | None = None,
    auth_shape: str = AUTH_SHAPE,
    app_id_carrier: str = DEFAULT_APP_ID_CARRIER,
    request_id_key: str = REQUEST_ID_QUERY_KEY,
    signature_mode: str = SIGNATURE_MODE,
) -> dict[str, Any]:
    return {
        "ok": False,
        "error": error,
        "kind": kind,
        "brain_provider": brain_provider,
        "vivo_credentials_configured": vivo_credentials_configured,
        "diagnosis": diagnosis,
        "http_status": http_status,
        "error_code": error_code,
        "error_msg": error_msg,
        "trace_id": trace_id,
        "request_id": request_id,
        "auth_shape": auth_shape,
        "app_id_carrier": app_id_carrier,
        "request_id_key": request_id_key,
        "signature_mode": signature_mode,
    }


def validate_strict(result: Any, *, brain_provider: str) -> tuple[bool, str]:
    raw = result.raw if isinstance(result.raw, dict) else {}
    has_upstream_markers = bool(result.usage) or raw.get("id") is not None or raw.get("created") is not None

    if brain_provider != "vivo":
        return False, f"expected brain_provider='vivo', got {brain_provider!r}"
    if result.provider != "vivo-llm":
        return False, f"expected provider=vivo-llm, got {result.provider!r}"
    if result.source != "vivo":
        return False, f"expected source=vivo, got {result.source!r}"
    if not result.model:
        return False, "expected provider_model to be non-empty"
    if not result.request_id:
        return False, "expected request_id to be non-empty"
    if result.fallback:
        return False, "expected fallback=false"
    if not has_upstream_markers:
        return False, "missing upstream vivo markers such as usage/id/created"
    return True, ""


def main() -> int:
    args = parse_args()
    settings = get_settings().model_copy(update={"enable_mock_provider": False} if args.strict else {})
    brain_provider = settings.brain_provider.strip().lower()
    vivo_credentials_configured = has_vivo_text_provider_config(settings)

    if args.strict and not can_use_vivo_text_provider(settings):
        print(
            json.dumps(
                build_error_output(
                    error=STRICT_CONFIG_ERROR,
                    kind="config",
                    brain_provider=brain_provider,
                    vivo_credentials_configured=vivo_credentials_configured,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    if can_use_vivo_text_provider(settings):
        provider = VivoLlmProvider(settings, app_id_carrier=args.app_id_carrier)
    else:
        provider = resolve_text_provider(settings)

    try:
        result = provider.summarize(prompt=args.prompt, fallback=args.fallback)
    except ProviderConfigurationError as exc:
        print(
            json.dumps(
                build_error_output(
                    error=str(exc),
                    kind="config",
                    brain_provider=brain_provider,
                    vivo_credentials_configured=vivo_credentials_configured,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    except ProviderAuthenticationError as exc:
        details = extract_error_details(exc)
        output = build_error_output(
            error=str(exc),
            kind=details["kind"],
            brain_provider=brain_provider,
            vivo_credentials_configured=vivo_credentials_configured,
            diagnosis=details["diagnosis"],
            http_status=details["http_status"],
            error_code=details["error_code"],
            error_msg=details["error_msg"],
            trace_id=details["trace_id"],
            request_id=details["request_id"],
            auth_shape=details["auth_shape"],
            app_id_carrier=details["app_id_carrier"],
            request_id_key=details["request_id_key"],
            signature_mode=details["signature_mode"],
        )
        if args.include_raw and isinstance(details["raw"], dict):
            output["raw"] = details["raw"]
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 1
    except ProviderResponseError as exc:
        details = extract_error_details(exc)
        output = build_error_output(
            error=str(exc),
            kind=details["kind"],
            brain_provider=brain_provider,
            vivo_credentials_configured=vivo_credentials_configured,
            diagnosis=details["diagnosis"],
            http_status=details["http_status"],
            error_code=details["error_code"],
            error_msg=details["error_msg"],
            trace_id=details["trace_id"],
            request_id=details["request_id"],
            auth_shape=details["auth_shape"],
            app_id_carrier=details["app_id_carrier"],
            request_id_key=details["request_id_key"],
            signature_mode=details["signature_mode"],
        )
        if args.include_raw and isinstance(details["raw"], dict):
            output["raw"] = details["raw"]
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 1

    output = build_output(
        result,
        include_raw=args.include_raw,
        brain_provider=brain_provider,
        vivo_credentials_configured=vivo_credentials_configured,
    )
    if args.strict:
        passed, reason = validate_strict(result, brain_provider=brain_provider)
        if not passed:
            output["ok"] = False
            output["error"] = reason
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 1

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
