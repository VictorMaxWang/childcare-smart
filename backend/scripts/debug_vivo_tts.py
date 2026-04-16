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
from app.providers.base import ProviderAuthenticationError, ProviderConfigurationError, ProviderResponseError
from app.providers.vivo_tts import TTS_AUTH_MODE, TTS_RUNTIME_METADATA_KEYS, VivoTtsProvider

DEFAULT_TEXT = "hello story"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a direct vivo TTS smoke/debug check.")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Text sent to vivo TTS.")
    parser.add_argument("--child-id", default="debug-child", help="Child id used to derive user_id.")
    parser.add_argument("--story-id", default="debug-story", help="Story id used to derive user_id.")
    parser.add_argument("--scene-index", type=int, default=0, help="Scene index used to derive user_id.")
    parser.add_argument("--voice-style", default="", help="Optional voice style label returned to callers.")
    parser.add_argument("--include-audio-url", action="store_true", help="Include the full audio data URL in the output.")
    return parser.parse_args()


def build_settings_summary(settings: Any, provider: VivoTtsProvider) -> dict[str, Any]:
    runtime_metadata = provider._runtime_metadata_query()
    query_keys = ["engineid", "system_time", "user_id", "requestId", *TTS_RUNTIME_METADATA_KEYS]
    return {
        "vivo_app_id_configured": bool((settings.vivo_app_id or "").strip()),
        "vivo_app_key_configured": bool(settings.vivo_app_key and settings.vivo_app_key.get_secret_value().strip()),
        "vivo_base_url": settings.vivo_base_url,
        "storybook_audio_provider": settings.storybook_audio_provider,
        "auth_mode": TTS_AUTH_MODE,
        "handshake_query_keys": query_keys,
        "runtime_metadata": runtime_metadata,
        "invalid_runtime_fields": [key for key, value in runtime_metadata.items() if not value],
        "profiles": [
            {
                "label": profile.label,
                "engine_id": profile.engine_id,
                "voice_name": profile.voice_name,
            }
            for profile in provider._profiles()
        ],
        "controls": {
            "speed": settings.storybook_tts_speed,
            "volume": settings.storybook_tts_volume,
        },
    }


def build_error_output(exc: Exception, *, settings_summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": False,
        "error": str(exc),
        "error_type": type(exc).__name__,
        "settings": settings_summary,
        "http_status": getattr(exc, "http_status", None),
        "diagnosis": getattr(exc, "diagnosis", None),
        "error_code": getattr(exc, "error_code", None),
        "error_msg": getattr(exc, "error_msg", None),
        "profile": getattr(exc, "profile", None),
        "engine_id": getattr(exc, "engine_id", None),
        "voice_name": getattr(exc, "voice_name", None),
        "invalid_runtime_fields": getattr(exc, "invalid_runtime_fields", None),
        "runtime_metadata": getattr(exc, "runtime_metadata", None),
        "debug": getattr(exc, "debug", None),
    }


def main() -> int:
    args = parse_args()
    settings = get_settings()
    provider = VivoTtsProvider(settings)
    settings_summary = build_settings_summary(settings, provider)

    try:
        result = provider.synthesize(
            text=args.text,
            child_id=args.child_id,
            story_id=args.story_id,
            scene_index=args.scene_index,
            voice_style=args.voice_style or None,
        )
    except (ProviderConfigurationError, ProviderAuthenticationError, ProviderResponseError) as exc:
        print(json.dumps(build_error_output(exc, settings_summary=settings_summary), ensure_ascii=False, indent=2))
        return 1

    output = {
        "ok": True,
        "settings": settings_summary,
        "request_id": result.get("requestId"),
        "profile_label": result.get("profileLabel"),
        "engine_id": result.get("engineId"),
        "voice_name": result.get("voiceName"),
        "audio_content_type": result.get("audioContentType"),
        "audio_bytes_len": len(result.get("audioBytes") or b""),
    }
    if args.include_audio_url:
        output["audio_url"] = result.get("audioUrl")

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
