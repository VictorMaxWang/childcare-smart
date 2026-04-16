from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

T = TypeVar("T")


class ProviderError(RuntimeError):
    """Base provider error that avoids leaking sensitive upstream context."""


class ProviderConfigurationError(ProviderError):
    """Raised when a provider cannot run because required configuration is missing."""


class ProviderAuthenticationError(ProviderError):
    """Raised when upstream authentication fails and should not silently fallback."""


class ProviderResponseError(ProviderError):
    """Raised when upstream returns an invalid or non-retryable response."""


@dataclass
class ProviderResult(Generic[T]):
    output: T
    provider: str
    mode: str
    source: str = "mock"
    model: str | None = None
    request_id: str | None = None


@dataclass
class ProviderTextResult:
    text: str
    source: str
    content: str | None = None
    model: str | None = None
    provider: str | None = None
    usage: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None
    fallback: bool = False
    request_id: str | None = None

    def __post_init__(self) -> None:
        if self.content is None:
            self.content = self.text
        if not self.text and self.content:
            self.text = self.content


class TextProvider(Protocol):
    def summarize(self, prompt: str, fallback: str) -> ProviderTextResult:
        ...


@dataclass
class AsrSegment:
    text: str
    start_ms: int | None = None
    end_ms: int | None = None


@dataclass
class AsrProviderInput:
    audio_bytes: bytes | None = None
    transcript: str | None = None
    attachment_name: str | None = None
    mime_type: str | None = None
    duration_ms: int | None = None
    scene: str | None = None
    fallback_text: str | None = None
    language: str | None = None


@dataclass
class AsrTranscription:
    transcript: str
    confidence: float | None = None
    segments: list[AsrSegment] | None = None
    meta: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None
    fallback: bool = False


class AsrProvider(Protocol):
    def transcribe(self, input: AsrProviderInput) -> ProviderResult[AsrTranscription]:
        ...
