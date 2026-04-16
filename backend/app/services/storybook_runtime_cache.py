from __future__ import annotations

import time
from threading import Lock
from typing import Any

STORYBOOK_RUNTIME_CACHE_TTL_SECONDS = 15 * 60
STORYBOOK_RUNTIME_CACHE_MAX_ITEMS = 128


class StorybookRuntimeCache:
    def __init__(
        self,
        *,
        ttl_seconds: int = STORYBOOK_RUNTIME_CACHE_TTL_SECONDS,
        max_items: int = STORYBOOK_RUNTIME_CACHE_MAX_ITEMS,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            payload = self._items.get(key)
            if payload is None:
                return None
            expires_at, value = payload
            if expires_at <= now:
                self._items.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            self._items[key] = (now + self.ttl_seconds, value)
            if len(self._items) > self.max_items:
                oldest_key = min(self._items.items(), key=lambda item: item[1][0])[0]
                self._items.pop(oldest_key, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def _prune(self, now: float) -> None:
        expired_keys = [key for key, (expires_at, _) in self._items.items() if expires_at <= now]
        for key in expired_keys:
            self._items.pop(key, None)


_storybook_runtime_cache = StorybookRuntimeCache()


def get_storybook_runtime_cache() -> StorybookRuntimeCache:
    return _storybook_runtime_cache
