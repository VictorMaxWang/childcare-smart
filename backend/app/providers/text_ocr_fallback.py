from __future__ import annotations

from typing import Any


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class TextOcrFallbackProvider:
    """Text-only OCR fallback.

    This provider never performs binary OCR. It only reuses request-supplied
    preview text and optional notes so downstream parsers can continue without
    pretending a live OCR provider was called.
    """

    provider_name = "text-ocr-fallback"
    model_name = "health-file-text-fallback"

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

        text = "\n".join(part for part in text_parts if part).strip()
        return {
            "provider": self.provider_name,
            "mode": "text-only-fallback",
            "state": "fallback",
            "text": text,
            "configured": False,
            "live": False,
            "fallback": True,
            "mock": False,
            "liveReadyButNotVerified": False,
            "model": self.model_name,
            "providerStatus": {
                "providerName": self.provider_name,
                "capability": "ocr",
                "state": "fallback",
                "configured": False,
                "live": False,
                "fallback": True,
                "mock": False,
                "supported": True,
                "isRealProvider": False,
                "status": "provider-unavailable",
                "reason": "FastAPI health-file bridge has no verified binary OCR transport; using request-supplied text only.",
                "requiredEnv": [],
                "warnings": [
                    "Binary OCR is not implemented in FastAPI.",
                    "File names, URLs, preview text, and notes are not live OCR evidence.",
                ],
            },
            "meta": {
                "fileNameCount": len(file_names),
                "previewTextCount": len(preview_texts),
                "fileUrlCount": len(file_urls),
                "remoteBinaryOcrImplemented": False,
                "reason": "request-supplied-text-only",
            },
        }
