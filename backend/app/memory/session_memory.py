from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionMemory:
    sessions: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def append(self, session_id: str, message: dict[str, Any]) -> None:
        self.sessions.setdefault(session_id, []).append(message)

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        return list(self.sessions.get(session_id, []))
