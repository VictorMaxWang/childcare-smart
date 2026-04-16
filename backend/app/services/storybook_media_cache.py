from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from threading import RLock
from time import time
from typing import Any

from app.core.config import Settings, get_settings


@dataclass
class StoryBookCachedAudioAsset:
    media_key: str
    payload: dict[str, Any]
    audio_bytes: bytes
    content_type: str
    expires_at: float


@dataclass
class _StoryBookCacheEntry:
    kind: str
    payload: dict[str, Any]
    expires_at: float
    audio_bytes: bytes | None = None
    content_type: str | None = None


class StoryBookMediaCache:
    def __init__(self, *, ttl_seconds: int, max_entries: int):
        self.ttl_seconds = max(ttl_seconds, 60)
        self.max_entries = max(max_entries, 12)
        self._entries: OrderedDict[str, _StoryBookCacheEntry] = OrderedDict()
        self._lock = RLock()

    @property
    def cache_window_seconds(self) -> int:
        return self.ttl_seconds

    def get_image(self, media_key: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune_locked()
            entry = self._entries.get(media_key)
            if not entry or entry.kind != "image":
                return None
            self._entries.move_to_end(media_key)
            return dict(entry.payload)

    def put_image(self, media_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            entry = _StoryBookCacheEntry(
                kind="image",
                payload=dict(payload),
                expires_at=self._expires_at(),
            )
            self._entries[media_key] = entry
            self._entries.move_to_end(media_key)
            self._prune_locked()
            return dict(entry.payload)

    def get_audio_payload(self, media_key: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune_locked()
            entry = self._entries.get(media_key)
            if not entry or entry.kind != "audio" or not entry.audio_bytes:
                return None
            self._entries.move_to_end(media_key)
            return dict(entry.payload)

    def get_audio_asset(self, media_key: str) -> StoryBookCachedAudioAsset | None:
        with self._lock:
            self._prune_locked()
            entry = self._entries.get(media_key)
            if not entry or entry.kind != "audio" or not entry.audio_bytes or not entry.content_type:
                return None
            self._entries.move_to_end(media_key)
            return StoryBookCachedAudioAsset(
                media_key=media_key,
                payload=dict(entry.payload),
                audio_bytes=entry.audio_bytes,
                content_type=entry.content_type,
                expires_at=entry.expires_at,
            )

    def put_audio(
        self,
        media_key: str,
        *,
        payload: dict[str, Any],
        audio_bytes: bytes,
        content_type: str = "audio/wav",
    ) -> StoryBookCachedAudioAsset:
        with self._lock:
            entry = _StoryBookCacheEntry(
                kind="audio",
                payload=dict(payload),
                expires_at=self._expires_at(),
                audio_bytes=bytes(audio_bytes),
                content_type=content_type,
            )
            self._entries[media_key] = entry
            self._entries.move_to_end(media_key)
            self._prune_locked()
            return StoryBookCachedAudioAsset(
                media_key=media_key,
                payload=dict(entry.payload),
                audio_bytes=entry.audio_bytes,
                content_type=entry.content_type or content_type,
                expires_at=entry.expires_at,
            )

    def _expires_at(self) -> float:
        return time() + float(self.ttl_seconds)

    def _prune_locked(self) -> None:
        now = time()
        expired_keys = [key for key, entry in self._entries.items() if entry.expires_at <= now]
        for key in expired_keys:
            self._entries.pop(key, None)

        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)


@lru_cache(maxsize=1)
def get_storybook_media_cache() -> StoryBookMediaCache:
    settings: Settings = get_settings()
    return StoryBookMediaCache(
        ttl_seconds=settings.storybook_media_cache_ttl_seconds,
        max_entries=settings.storybook_media_cache_max_entries,
    )
