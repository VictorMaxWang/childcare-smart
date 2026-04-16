from __future__ import annotations

from typing import Any

from app.core.config import Settings


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class VivoOcrProvider:
    """Conservative OCR bridge.

    T8 only guarantees structured extraction from text that is already available
    in the request shape, such as preview text, optional notes, file names, and
    URLs. A verified upstream binary OCR flow is intentionally not claimed here.
    """

    provider_name = "vivo-ocr-text-fallback"
    model_name = "t8-health-file-bridge-preview"

    def __init__(self, settings: Settings):
        self.settings = settings

    def extract(
        self,
        *,
        files: list[dict[str, Any]],
        optional_notes: str | None = None,
    ) -> dict[str, Any]:
        preview_texts = []
        file_names = []
        file_urls = []

        for item in files:
            if not isinstance(item, dict):
                continue
            name = _coerce_string(item.get("name"))
            preview_text = _coerce_string(item.get("previewText") or item.get("preview_text"))
            file_url = _coerce_string(item.get("fileUrl") or item.get("file_url"))
            if name:
                file_names.append(name)
            if preview_text:
                preview_texts.append(preview_text)
            if file_url:
                file_urls.append(file_url)

        notes = _coerce_string(optional_notes)
        text_parts = [*preview_texts]
        if notes:
            text_parts.append(notes)
        if not text_parts and file_names:
            text_parts.append(" ".join(file_names))

        text = "\n".join(part for part in text_parts if part).strip()
        return {
            "provider": self.provider_name,
            "mode": "text-only-fallback",
            "text": text,
            "fallback": True,
            "liveReadyButNotVerified": True,
            "model": self.model_name,
            "meta": {
                "configuredPath": self.settings.vivo_ocr_path,
                "fileNameCount": len(file_names),
                "previewTextCount": len(preview_texts),
                "fileUrlCount": len(file_urls),
                "remoteBinaryOcrImplemented": False,
                "reason": "T8 uses request-supplied text hints only; upstream OCR transport is not verified.",
            },
        }
