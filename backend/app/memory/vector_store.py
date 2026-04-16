from __future__ import annotations

from dataclasses import dataclass, field
from math import sqrt
from typing import Any


def _simple_embedding(text: str) -> list[float]:
    buckets = [0.0] * 8
    for index, char in enumerate(text.lower()):
        buckets[index % len(buckets)] += float(ord(char) % 31)
    return buckets


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = sqrt(sum(a * a for a in left))
    right_norm = sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


@dataclass
class SimpleVectorStore:
    items: list[dict[str, Any]] = field(default_factory=list)

    def add(self, text: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        record = {"text": text, "metadata": metadata or {}, "embedding": _simple_embedding(text)}
        self.items.append(record)
        return record

    def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        query_embedding = _simple_embedding(query)
        scored = [
            {
                **item,
                "score": _cosine(query_embedding, item["embedding"]),
            }
            for item in self.items
        ]
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:limit]
