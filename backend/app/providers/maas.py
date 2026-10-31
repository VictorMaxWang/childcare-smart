from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import threading
from contextlib import asynccontextmanager, contextmanager
from time import monotonic
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings
from app.providers.base import (
    AsrProviderInput, AsrTranscription, ProviderAuthenticationError,
    ProviderConfigurationError, ProviderResponseError, ProviderResult, ProviderTextResult,
)

logger = logging.getLogger(__name__)
_USAGE_NUMBER_FIELDS = {"prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens", "audio_tokens", "image_tokens", "text_tokens", "accepted_prediction_tokens", "rejected_prediction_tokens", "image_count", "duration", "characters", "input_characters", "output_characters", "billable_characters"}
_USAGE_DETAIL_FIELDS = {"prompt_tokens_details", "completion_tokens_details", "input_tokens_details", "output_tokens_details"}
# 只接受已知协议错误码；不把任意上游字段（可能回显输入）拼入异常或日志。
_SAFE_ERROR_CODES = frozenset({"InvalidParameter", "InvalidParameter.UnsupportedModel", "InvalidApiKey",
    "InvalidApiKey.NotFound", "Unauthorized", "AccessDenied", "Forbidden", "ModelNotFound", "ModelNotActivated",
    "SubscriptionRequired", "Arrearage", "QuotaExceeded", "Throttling", "Throttling.RateQuota",
    "RateLimitExceeded", "DataInspectionFailed", "InputDataInspectionFailed", "OutputDataInspectionFailed",
    "SensitiveContent", "UnsupportedOperation", "InternalError", "ServiceUnavailable",
    "invalid_request_error", "invalid_parameter", "invalid_parameter_error", "invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "content_filter", "1004"})


def _raise_upstream_failure(response: httpx.Response) -> None:
    """保留状态与固定分类以支持排障，禁止记录上游 message、原文、URL 或请求内容。"""
    try:
        raw = response.json()
    except ValueError:
        raw = None
    data = raw if isinstance(raw, dict) else {}
    upstream_error = data.get("error")
    candidate_code = upstream_error.get("code") if isinstance(upstream_error, dict) else data.get("code")
    code = candidate_code if isinstance(candidate_code, str) and candidate_code in _SAFE_ERROR_CODES else None
    # 网关把未开通产品与上游Token错误也包装成HTTP400，不能误报成业务JSON参数错误。
    # message仅在内存中匹配固定协议含义，原文及其他未知内容绝不写入日志/异常。
    message = upstream_error.get("message") if isinstance(upstream_error, dict) else data.get("message")
    product_not_activated = code == "invalid_parameter_error" and isinstance(message, str) and "The product is not activated" in message
    status = response.status_code
    category = (
        "upstream-model-not-activated" if product_not_activated
        else "upstream-content-rejected" if code in {"DataInspectionFailed", "InputDataInspectionFailed", "OutputDataInspectionFailed", "SensitiveContent", "content_filter"}
        else "upstream-authentication" if status in {401, 403} or code == "1004"
        else "upstream-rate-limited" if status == 429
        else "upstream-invalid-request" if 400 <= status < 500
        else "upstream-service-failure"
    )
    logger.warning("ai.provider_error %s", json.dumps({"provider": "maas", "httpStatus": status,
        "category": category, "code": code}, ensure_ascii=False))
    error_type = ProviderAuthenticationError if category == "upstream-authentication" else ProviderResponseError
    error = error_type(f"MaaS provider returned HTTP {status} ({category})" + (f" code={code}" if code else ""))
    error.http_status = status
    error.diagnosis = category
    error.error_code = code
    raise error


class SharedTextRequestLimiter:
    """同步工作线程与异步入口共享三槽位；异步排队不占线程，等待者总数有界。"""

    def __init__(self, slots: int = 3, max_waiters: int = 20) -> None:
        self._slots = threading.BoundedSemaphore(slots)
        self._waiter_lock = threading.Lock()
        self._waiters = 0
        self._max_waiters = max_waiters

    @property
    def waiting(self) -> int:
        with self._waiter_lock:
            return self._waiters

    def _join_queue(self) -> None:
        with self._waiter_lock:
            if self._waiters >= self._max_waiters:
                raise ProviderResponseError("MaaS text request queue is full")
            self._waiters += 1

    def _leave_queue(self) -> None:
        with self._waiter_lock:
            self._waiters -= 1

    @staticmethod
    def remaining(deadline: float) -> float:
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise ProviderResponseError("MaaS text request deadline exceeded before dispatch")
        return remaining

    @contextmanager
    def sync_slot(self, deadline: float):
        self.remaining(deadline)
        acquired = self._slots.acquire(blocking=False)
        if not acquired:
            self._join_queue()
            try:
                acquired = self._slots.acquire(timeout=self.remaining(deadline))
            finally:
                self._leave_queue()
            if not acquired:
                raise ProviderResponseError("MaaS text request queue deadline exceeded")
        try:
            self.remaining(deadline)
            yield
        finally:
            self._slots.release()

    @asynccontextmanager
    async def async_slot(self, deadline: float):
        self.remaining(deadline)
        acquired = self._slots.acquire(blocking=False)
        if not acquired:
            self._join_queue()
            try:
                while not acquired:
                    remaining = self.remaining(deadline)
                    acquired = self._slots.acquire(blocking=False)
                    if not acquired:
                        # 复用同一线程安全信号量；最多20个轻量协程等待，不创建 to_thread 等待线程。
                        await asyncio.sleep(min(0.02, remaining))
            finally:
                self._leave_queue()
        try:
            self.remaining(deadline)
            yield
        finally:
            self._slots.release()


_TEXT_REQUEST_LIMITER = SharedTextRequestLimiter()


def _safe_usage(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, item in value.items():
        if key in _USAGE_NUMBER_FIELDS and isinstance(item, (int, float)) and not isinstance(item, bool) and item >= 0 and (not isinstance(item, float) or math.isfinite(item)):
            result[key] = item
        elif key in _USAGE_DETAIL_FIELDS and isinstance(item, dict):
            result[key] = _safe_usage(item)
    return result


def _read_audited_json(response: httpx.Response, model: str, enabled: bool) -> Any:
    try:
        raw = response.json()
    except ValueError:
        raw = None
    if enabled:
        # 只保留计费数值，不能把模型原文或 usage 中的未知身份字段写入日志。
        data = raw if isinstance(raw, dict) else {}
        logger.info("ai.usage %s", json.dumps({"provider": "maas", "model": model,
            "requestId": response.headers.get("x-request-id") or next((value for value in [data.get("request_id"), data.get("id")] if isinstance(value, str)), None),
            "httpStatus": response.status_code, "usage": _safe_usage(data.get("usage")),
            "ttsCharacters": 0, "imageCount": 0}, ensure_ascii=False, allow_nan=False))
    return raw


def maas_selected(settings: Settings) -> bool:
    return (getattr(settings, "ai_provider", "") or "").strip().lower() in {"maas", "openai-compatible"}


def maas_configured(settings: Settings) -> bool:
    return maas_selected(settings) and bool(settings.ai_api_key and settings.ai_api_key.get_secret_value().strip())


def real_text_result(result: ProviderTextResult) -> bool:
    return result.source in {"vivo", "maas", "ai"} and not result.fallback


class MaasTextProvider:
    """统一网关文本适配器；错误只含状态分类，不携带提示词或上游原文。"""

    provider_name = "maas-llm"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _request_shape(self, messages: list[dict[str, Any]], model: str | None = None, *, json_output: bool = False) -> tuple[str, dict[str, str], dict[str, Any]]:
        if not maas_configured(self.settings):
            raise ProviderConfigurationError("MaaS provider configuration is missing")
        selected_model = model or self.settings.ai_text_model
        body: dict[str, Any] = {"model": selected_model, "messages": messages, "stream": False, "max_tokens": 6000}
        if "glm-5.3" in selected_model.lower():
            body["reasoning_effort"] = "low"
        elif selected_model.lower() == "qwen3.8-flash":
            # 已核验的千问混合思考型号允许直接回答；不能把此参数发送给 GLM。
            body["enable_thinking"] = False
        if json_output:
            body["response_format"] = {"type": "json_object"}
        return (
            self.settings.ai_base_url.rstrip("/") + "/chat/completions",
            {"Authorization": f"Bearer {self.settings.ai_api_key.get_secret_value()}", "Content-Type": "application/json"},
            body,
        )

    @staticmethod
    def _result(response: httpx.Response, model: str, *, audit_enabled: bool = False) -> ProviderTextResult:
        if not response.is_success:
            _raise_upstream_failure(response)
        category = "invalid-provider-structure"
        fields = ["choices[0].message.content"]
        try:
            raw = _read_audited_json(response, model, audit_enabled)
            if not isinstance(raw, dict):
                category = "invalid-provider-json-object"
                fields = []
                raise ValueError("object required")
            choice = raw["choices"][0]
            content = choice["message"]["content"]
            text = content.strip() if isinstance(content, str) else "\n".join(part.get("text", "") for part in content if isinstance(part, dict)).strip()
            if not text:
                category = "empty-provider-content"
                raise ValueError("empty message")
            if choice.get("finish_reason") not in {None, "stop"}:
                category = "incomplete-provider-content"
                fields = ["choices[0].finish_reason"]
                raise ValueError("incomplete message")
        except (ValueError, KeyError, IndexError, TypeError) as error:
            logger.warning("ai.structured_validation %s", json.dumps({"category": category, "fields": fields}))
            raise ProviderResponseError("MaaS provider returned invalid content") from error
        return ProviderTextResult(
            text=text, source="ai", provider="maas-llm", model=raw.get("model") or model,
            request_id=response.headers.get("x-request-id") or raw.get("id") or raw.get("request_id"),
            usage=raw.get("usage") if isinstance(raw.get("usage"), dict) else None,
            meta={"realProvider": True, "mode": "live"}, fallback=False,
        )

    def summarize(self, prompt: str, fallback: str, *, json_output: bool = False) -> ProviderTextResult:
        endpoint, headers, payload = self._request_shape([
            {"role": "system", "content": "你是托育照护与家园沟通助手。仅依据输入记录回答，不编造事实，不进行医疗诊断。遵循用户指定JSON格式。"},
            {"role": "user", "content": prompt},
        ], json_output=json_output)
        deadline = monotonic() + self.settings.ai_timeout_ms / 1000
        with _TEXT_REQUEST_LIMITER.sync_slot(deadline):
            try:
                with httpx.Client(timeout=_TEXT_REQUEST_LIMITER.remaining(deadline), follow_redirects=False) as client:
                    response = client.post(endpoint, headers=headers, json=payload)
            except httpx.HTTPError as error:
                raise ProviderResponseError("MaaS provider request failed") from error
        return self._result(response, self.settings.ai_text_model, audit_enabled=self.settings.ai_usage_audit)

    async def asummarize(self, prompt: str, fallback: str, *, json_output: bool = False) -> ProviderTextResult:
        endpoint, headers, payload = self._request_shape([
            {"role": "system", "content": "你是托育照护与家园沟通助手。仅依据输入记录回答，不编造事实，不进行医疗诊断。遵循用户指定JSON格式。"},
            {"role": "user", "content": prompt},
        ], json_output=json_output)
        deadline = monotonic() + self.settings.ai_timeout_ms / 1000
        async with _TEXT_REQUEST_LIMITER.async_slot(deadline):
            try:
                async with httpx.AsyncClient(timeout=_TEXT_REQUEST_LIMITER.remaining(deadline), follow_redirects=False) as client:
                    response = await client.post(endpoint, headers=headers, json=payload)
            except httpx.HTTPError as error:
                raise ProviderResponseError("MaaS provider request failed") from error
        return self._result(response, self.settings.ai_text_model, audit_enabled=self.settings.ai_usage_audit)


async def summarize_async(provider: Any, *, prompt: str, fallback: str, json_output: bool = False) -> ProviderTextResult:
    """在异步业务入口中使用原生异步网关；旧同步供应商转入线程避免阻塞事件循环。"""
    if isinstance(provider, MaasTextProvider):
        return await provider.asummarize(prompt=prompt, fallback=fallback, json_output=json_output)
    return await asyncio.to_thread(provider.summarize, prompt=prompt, fallback=fallback)


class MaasAsrProvider(MaasTextProvider):
    provider_name = "maas-asr"

    def transcribe(self, input: AsrProviderInput) -> ProviderResult[AsrTranscription]:
        if not input.audio_bytes:
            # 人工提供的文字不是语音识别结果，不能因此标成 live。
            text = (input.transcript or input.fallback_text or "").strip()
            return ProviderResult(AsrTranscription(transcript=text, confidence=None, fallback=True), provider="provided-transcript", mode="fallback", source="provided-transcript", model=None)
        mime = input.mime_type or "audio/wav"
        endpoint, headers, payload = self._request_shape([
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": f"data:{mime};base64,{base64.b64encode(input.audio_bytes).decode()}"}}]},
        ], self.settings.ai_asr_model)
        native = self.settings.ai_asr_protocol == "native"
        if native:
            audio_format = {"audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/opus": "opus", "audio/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a"}.get(mime.split(";")[0])
            if not audio_format:
                raise ProviderResponseError("Unsupported ASR audio format")
            origin = urlsplit(self.settings.ai_base_url)
            endpoint = self.settings.ai_asr_endpoint or f"{origin.scheme}://{origin.netloc}/api/v1/services/aigc/multimodal-generation/generation"
            # 原生 Qwen-Audio ASR 不接受 chat 的 max_tokens 等字段，响应也不在 choices 中。
            payload = {"model": self.settings.ai_asr_model, "input": {"messages": payload["messages"]}, "parameters": {"format": audio_format}}
        try:
            with httpx.Client(timeout=self.settings.ai_timeout_ms / 1000, follow_redirects=False) as client:
                response = client.post(endpoint, headers=headers, json=payload)
        except httpx.HTTPError as error:
            raise ProviderResponseError("MaaS ASR request failed") from error
        if native:
            if not response.is_success:
                _raise_upstream_failure(response)
            try:
                raw = _read_audited_json(response, self.settings.ai_asr_model, self.settings.ai_usage_audit)
                output = raw["output"]
                text = (output.get("text") or output.get("sentence", {}).get("text") or "").strip()
                if not text:
                    raise ValueError("empty transcript")
            except (ValueError, TypeError, KeyError, AttributeError) as error:
                raise ProviderResponseError("MaaS ASR returned invalid transcript") from error
            result = ProviderTextResult(text=text, source="ai", model=self.settings.ai_asr_model, provider="maas-asr", request_id=raw.get("request_id"), usage=raw.get("usage") if isinstance(raw.get("usage"), dict) else None, fallback=False)
        else:
            result = self._result(response, self.settings.ai_asr_model, audit_enabled=self.settings.ai_usage_audit)
        return ProviderResult(AsrTranscription(transcript=result.text, confidence=None, fallback=False, meta={"requestId": result.request_id}), provider="maas-asr", mode="live", source="maas", model=result.model, request_id=result.request_id)
