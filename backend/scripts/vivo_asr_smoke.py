from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.providers.base import AsrProviderInput, ProviderAuthenticationError, ProviderConfigurationError, ProviderResponseError
from app.providers.resolver import can_use_vivo_asr_provider, resolve_asr_provider

STRICT_CONFIG_ERROR = "strict smoke requires BRAIN_PROVIDER=vivo and both VIVO_APP_ID/VIVO_APP_KEY."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a direct vivo ASR smoke test without Next.js fallback.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--strict", dest="strict", action="store_true", help="Require a live vivo ASR result.")
    group.add_argument(
        "--allow-fallback",
        dest="strict",
        action="store_false",
        help="Allow mock fallback when vivo ASR is unavailable.",
    )
    parser.set_defaults(strict=True)
    parser.add_argument("--audio", required=True, help="Local audio file used for transcription.")
    parser.add_argument("--scene", default="asr-smoke", help="Scene marker forwarded to the provider.")
    parser.add_argument("--include-raw", action="store_true", help="Include raw upstream JSON in the output.")
    return parser.parse_args()


def build_output(result: Any, *, include_raw: bool, brain_provider: str, vivo_credentials_configured: bool) -> dict[str, Any]:
    raw = result.output.raw if isinstance(result.output.raw, dict) else {}
    meta = result.output.meta if isinstance(result.output.meta, dict) else {}
    output = {
        "ok": True,
        "brain_provider": brain_provider,
        "vivo_credentials_configured": vivo_credentials_configured,
        "provider": result.provider,
        "source": result.source,
        "model": result.model,
        "fallback": result.output.fallback,
        "real_provider": result.source == "vivo" and not result.output.fallback,
        "request_id": result.request_id,
        "confidence": result.output.confidence,
        "segment_count": len(result.output.segments or []),
        "transcript_preview": (result.output.transcript or "")[:160],
        "meta": meta,
        "upstream_markers": {
            "transport": raw.get("transport"),
            "has_result_stage": isinstance(raw.get("stages"), dict) and "result" in raw.get("stages", {}),
            "audio_id": meta.get("audio_id"),
            "task_id": meta.get("task_id"),
        },
    }
    if include_raw:
        output["raw"] = raw
    return output


def build_error_output(*, error: str, kind: str, brain_provider: str, vivo_credentials_configured: bool) -> dict[str, Any]:
    return {
        "ok": False,
        "error": error,
        "kind": kind,
        "brain_provider": brain_provider,
        "vivo_credentials_configured": vivo_credentials_configured,
    }


def validate_strict(result: Any, *, brain_provider: str) -> tuple[bool, str]:
    raw = result.output.raw if isinstance(result.output.raw, dict) else {}
    meta = result.output.meta if isinstance(result.output.meta, dict) else {}
    stages = raw.get("stages") if isinstance(raw.get("stages"), dict) else {}

    if brain_provider != "vivo":
        return False, f"expected brain_provider='vivo', got {brain_provider!r}"
    if result.provider != "vivo-asr":
        return False, f"expected provider='vivo-asr', got {result.provider!r}"
    if result.source != "vivo":
        return False, f"expected source='vivo', got {result.source!r}"
    if not result.model:
        return False, "expected model to be non-empty"
    if not result.request_id:
        return False, "expected request_id to be non-empty"
    if result.output.fallback:
        return False, "expected fallback=false"
    if not (result.output.transcript or "").strip():
        return False, "expected transcript to be non-empty"
    if raw.get("transport") != "vivo-lasr-http":
        return False, "expected raw.transport='vivo-lasr-http'"
    if "result" not in stages:
        return False, "missing raw.stages.result"
    if not meta.get("audio_id") or not meta.get("task_id"):
        return False, "missing audio_id/task_id markers in meta"
    return True, ""


def main() -> int:
    args = parse_args()
    settings = get_settings().model_copy(update={"enable_mock_provider": False} if args.strict else {})
    brain_provider = settings.brain_provider.strip().lower()
    vivo_credentials_configured = can_use_vivo_asr_provider(settings, prefer_vivo=True)

    if args.strict and not can_use_vivo_asr_provider(settings):
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

    audio_path = Path(args.audio).expanduser()
    if not audio_path.is_absolute():
        audio_path = (Path.cwd() / audio_path).resolve()
    if not audio_path.exists():
        print(
            json.dumps(
                build_error_output(
                    error=f"audio file not found: {audio_path}",
                    kind="input",
                    brain_provider=brain_provider,
                    vivo_credentials_configured=vivo_credentials_configured,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    mime_type = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"
    provider = resolve_asr_provider(settings)

    try:
        result = provider.transcribe(
            AsrProviderInput(
                audio_bytes=audio_path.read_bytes(),
                attachment_name=audio_path.name,
                mime_type=mime_type,
                scene=args.scene,
            )
        )
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
        print(
            json.dumps(
                build_error_output(
                    error=str(exc),
                    kind="auth",
                    brain_provider=brain_provider,
                    vivo_credentials_configured=vivo_credentials_configured,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    except ProviderResponseError as exc:
        message = str(exc).lower()
        kind = "response"
        if "timeout" in message:
            kind = "timeout"
        elif "network" in message or "connection" in message:
            kind = "network"
        print(
            json.dumps(
                build_error_output(
                    error=str(exc),
                    kind=kind,
                    brain_provider=brain_provider,
                    vivo_credentials_configured=vivo_credentials_configured,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
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
