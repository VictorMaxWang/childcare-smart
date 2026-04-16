from datetime import datetime, timezone
from typing import Any


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_non_empty(items: list[str], fallback: str) -> str:
    for item in items:
        cleaned = item.strip()
        if cleaned:
            return cleaned
    return fallback


def unique_texts(items: list[str], limit: int = 4) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = item.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
        if len(result) >= limit:
            break
    return result
