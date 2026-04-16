from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.providers.base import ProviderAuthenticationError, ProviderResponseError


REPO_ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, relative_path: str):
    module_path = REPO_ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


vivo_smoke = load_module("vivo_llm_smoke", "backend/scripts/vivo_llm_smoke.py")
vivo_asr_smoke = load_module("vivo_asr_smoke", "backend/scripts/vivo_asr_smoke.py")
consultation_smoke = load_module("consultation_sse_smoke", "backend/scripts/consultation_sse_smoke.py")


def build_result(**overrides):
    defaults = {
        "provider": "vivo-llm",
        "source": "vivo",
        "model": "Volc-DeepSeek-V3.2",
        "fallback": False,
        "request_id": "req-123",
        "usage": {"total_tokens": 42},
        "meta": {"finish_reason": "stop"},
        "raw": {"id": "chatcmpl-123", "created": 1712300000},
        "content": "真实返回",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def build_asr_result(**overrides):
    output = {
        "transcript": "小明今天体温37.6度，需要继续观察。",
        "confidence": None,
        "segments": [SimpleNamespace(text="小明今天体温37.6度，需要继续观察。", start_ms=0, end_ms=1200)],
        "meta": {
            "audio_id": "audio-1",
            "task_id": "task-1",
            "transport": "vivo-lasr-http",
        },
        "raw": {
            "transport": "vivo-lasr-http",
            "stages": {"result": {"sid": "sid-result"}},
        },
        "fallback": False,
    }
    defaults = {
        "provider": "vivo-asr",
        "source": "vivo",
        "model": "fileasrrecorder",
        "request_id": "req-asr-123",
        "output": SimpleNamespace(**output),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_validate_strict_accepts_real_vivo_result():
    passed, reason = vivo_smoke.validate_strict(build_result(), brain_provider="vivo")
    assert passed is True
    assert reason == ""


def test_validate_strict_rejects_mock_fallback():
    passed, reason = vivo_smoke.validate_strict(
        build_result(source="mock", fallback=True),
        brain_provider="vivo",
    )
    assert passed is False
    assert "source=vivo" in reason


def test_validate_strict_rejects_missing_upstream_markers():
    passed, reason = vivo_smoke.validate_strict(
        build_result(usage=None, raw={}),
        brain_provider="vivo",
    )
    assert passed is False
    assert "missing upstream vivo markers" in reason


def test_validate_strict_rejects_non_vivo_brain_provider():
    passed, reason = vivo_smoke.validate_strict(build_result(), brain_provider="mock")
    assert passed is False
    assert "brain_provider='vivo'" in reason


def test_vivo_smoke_build_output_includes_auth_diagnostics():
    output = vivo_smoke.build_output(
        build_result(
            meta={
                "finish_reason": "stop",
                "status_code": 200,
                "auth_shape": vivo_smoke.AUTH_SHAPE,
                "app_id_carrier": "query",
                "request_id_key": vivo_smoke.REQUEST_ID_QUERY_KEY,
                "signature_mode": vivo_smoke.SIGNATURE_MODE,
                "diagnosis": "auth_ok",
                "trace_id": "trace-ok",
            }
        ),
        include_raw=False,
        brain_provider="vivo",
        vivo_credentials_configured=True,
    )

    assert output["auth_shape"] == vivo_smoke.AUTH_SHAPE
    assert output["app_id_carrier"] == "query"
    assert output["request_id_key"] == vivo_smoke.REQUEST_ID_QUERY_KEY
    assert output["signature_mode"] == vivo_smoke.SIGNATURE_MODE
    assert output["diagnosis"] == "auth_ok"
    assert output["http_status"] == 200
    assert output["trace_id"] == "trace-ok"
    assert output["upstream_status_code"] == 200


def test_vivo_smoke_error_output_includes_auth_diagnostics():
    exc = ProviderAuthenticationError("auth failed")
    exc.kind = "auth"
    exc.diagnosis = "app_id_invalid_or_mismatched"
    exc.http_status = 401
    exc.error_code = 40102
    exc.error_msg = "invalid app_id"
    exc.trace_id = "trace-auth"
    exc.request_id = "req-auth"
    exc.auth_shape = vivo_smoke.AUTH_SHAPE
    exc.app_id_carrier = "query"
    exc.request_id_key = vivo_smoke.REQUEST_ID_QUERY_KEY
    exc.signature_mode = vivo_smoke.SIGNATURE_MODE
    exc.raw = {"error_code": 40102}

    details = vivo_smoke.extract_error_details(exc)
    output = vivo_smoke.build_error_output(
        error=str(exc),
        kind=details["kind"],
        brain_provider="vivo",
        vivo_credentials_configured=True,
        diagnosis=details["diagnosis"],
        http_status=details["http_status"],
        error_code=details["error_code"],
        error_msg=details["error_msg"],
        trace_id=details["trace_id"],
        request_id=details["request_id"],
        auth_shape=details["auth_shape"],
        app_id_carrier=details["app_id_carrier"],
        request_id_key=details["request_id_key"],
        signature_mode=details["signature_mode"],
    )

    assert output["kind"] == "auth"
    assert output["diagnosis"] == "app_id_invalid_or_mismatched"
    assert output["http_status"] == 401
    assert output["error_code"] == 40102
    assert output["error_msg"] == "invalid app_id"
    assert output["trace_id"] == "trace-auth"
    assert output["request_id"] == "req-auth"
    assert output["auth_shape"] == vivo_smoke.AUTH_SHAPE
    assert output["app_id_carrier"] == "query"
    assert output["request_id_key"] == vivo_smoke.REQUEST_ID_QUERY_KEY
    assert output["signature_mode"] == vivo_smoke.SIGNATURE_MODE


def test_vivo_smoke_error_output_includes_model_permission_diagnostics():
    exc = ProviderResponseError("permission failed")
    exc.kind = "permission"
    exc.diagnosis = "model_permission_missing"
    exc.http_status = 403
    exc.error_msg = "not having this ability, you need to apply for it"
    exc.trace_id = "trace-permission"
    exc.request_id = "req-permission"
    exc.auth_shape = vivo_smoke.AUTH_SHAPE
    exc.app_id_carrier = "query"
    exc.request_id_key = vivo_smoke.REQUEST_ID_QUERY_KEY
    exc.signature_mode = vivo_smoke.SIGNATURE_MODE

    details = vivo_smoke.extract_error_details(exc)

    assert details["kind"] == "permission"
    assert details["diagnosis"] == "model_permission_missing"
    assert details["http_status"] == 403
    assert details["error_msg"] == "not having this ability, you need to apply for it"
    assert details["trace_id"] == "trace-permission"
    assert details["app_id_carrier"] == "query"
    assert details["request_id_key"] == vivo_smoke.REQUEST_ID_QUERY_KEY
    assert details["signature_mode"] == vivo_smoke.SIGNATURE_MODE


def test_asr_validate_strict_accepts_real_vivo_result():
    passed, reason = vivo_asr_smoke.validate_strict(build_asr_result(), brain_provider="vivo")
    assert passed is True
    assert reason == ""


def test_asr_validate_strict_rejects_mock_fallback():
    failed_result = build_asr_result(source="mock")
    failed_result.output.fallback = True

    passed, reason = vivo_asr_smoke.validate_strict(failed_result, brain_provider="vivo")

    assert passed is False
    assert "source='vivo'" in reason or "fallback=false" in reason


def test_asr_validate_strict_rejects_missing_transport_markers():
    failed_result = build_asr_result()
    failed_result.output.meta = {}
    failed_result.output.raw = {}

    passed, reason = vivo_asr_smoke.validate_strict(failed_result, brain_provider="vivo")

    assert passed is False
    assert "raw.transport" in reason or "audio_id/task_id" in reason


def build_stream_events():
    return [
        {"event": "status", "data": {"stage": "long_term_profile"}},
        {"event": "text", "data": {"stage": "long_term_profile"}},
        {"event": "ui", "data": {"stage": "long_term_profile"}},
        {"event": "status", "data": {"stage": "recent_context"}},
        {"event": "text", "data": {"stage": "recent_context"}},
        {"event": "ui", "data": {"stage": "recent_context"}},
        {"event": "status", "data": {"stage": "current_recommendation"}},
        {"event": "text", "data": {"stage": "current_recommendation"}},
        {"event": "ui", "data": {"stage": "current_recommendation"}},
        {
            "event": "done",
            "data": {
                "traceId": "trace-123",
                "realProvider": True,
                "fallback": False,
                "providerTrace": {
                    "source": "vivo",
                    "model": "Volc-DeepSeek-V3.2",
                    "requestId": "req-123",
                    "transport": "fastapi-brain",
                    "transportSource": "fastapi-brain",
                    "brainProvider": "vivo",
                },
                "memoryMeta": {
                    "memory_context_used": True,
                    "usedSources": ["agent_state_snapshots", "agent_trace_log"],
                    "matchedSnapshotIds": ["snapshot-1"],
                    "matchedTraceIds": ["trace-row-1"],
                },
            },
        },
    ]


def test_summarize_events_extracts_provider_and_memory_fields():
    summary = consultation_smoke.summarize_events(build_stream_events())

    assert summary["event_sequence"] == [
        "status",
        "text",
        "ui",
        "status",
        "text",
        "ui",
        "status",
        "text",
        "ui",
        "done",
    ]
    assert summary["stage_sequence"] == [
        "long_term_profile",
        "recent_context",
        "current_recommendation",
    ]
    assert summary["provider_source"] == "vivo"
    assert summary["provider_model"] == "Volc-DeepSeek-V3.2"
    assert summary["request_id"] == "req-123"
    assert summary["transport"] == "fastapi-brain"
    assert summary["transport_source"] == "fastapi-brain"
    assert summary["brain_provider"] == "vivo"
    assert summary["real_provider"] is True
    assert summary["fallback"] is False
    assert summary["memory_context_used"] is True
    assert summary["memory_used_sources"] == ["agent_state_snapshots", "agent_trace_log"]
    assert summary["matched_snapshot_ids"] == ["snapshot-1"]
    assert summary["matched_trace_ids"] == ["trace-row-1"]


def test_summarize_stream_trace_preserves_timing_fields():
    summary = consultation_smoke.summarize_stream_trace(
        {
            "http_status": 200,
            "content_type": "text/event-stream; charset=utf-8",
            "header_elapsed_seconds": 0.021,
            "first_frame_seconds": 0.123,
            "first_event_seconds": 0.456,
            "events": build_stream_events(),
        }
    )

    assert summary["http_status"] == 200
    assert summary["content_type"] == "text/event-stream; charset=utf-8"
    assert summary["header_elapsed_seconds"] == 0.021
    assert summary["first_frame_seconds"] == 0.123
    assert summary["first_event_seconds"] == 0.456
    assert summary["transport"] == "fastapi-brain"


def test_summarize_events_rejects_missing_required_stage():
    broken_events = [event for event in build_stream_events() if event["data"].get("stage") != "recent_context"]

    with pytest.raises(RuntimeError, match="missing SSE stages"):
        consultation_smoke.summarize_events(broken_events)


def test_evaluate_provider_requires_real_vivo_when_requested():
    issues = consultation_smoke.evaluate_provider(
        {
            "brain_provider": "mock",
            "provider_source": "mock",
            "provider_model": "",
            "request_id": "",
            "transport": "next-stream-fallback",
            "transport_source": "next-server",
            "real_provider": False,
            "fallback": True,
        },
        require_real_provider=True,
    )

    assert issues == [
        "expected brain_provider='vivo', got 'mock'",
        "expected provider_source='vivo', got 'mock'",
        "expected provider_model to be non-empty",
        "expected request_id to be non-empty",
        "expected transport_source='fastapi-brain' or transport='fastapi-brain'",
        "expected real_provider=true",
        "expected fallback=false",
    ]


def test_evaluate_health_summary_rejects_old_runtime_markers():
    issues = consultation_smoke.evaluate_health_summary(
        {
            "status": "ok",
            "environment": "development",
            "providers": {"llm": "mock"},
            "brain_provider": "",
            "llm_provider_selected": "",
            "provider_assertion_scope": None,
        }
    )

    assert issues == [
        "expected provider_assertion_scope='configuration_only', got None",
        "expected brain_provider to be non-empty",
        "expected llm_provider_selected to be non-empty",
        "expected environment to not be 'development'",
        "expected providers.llm to not be 'mock'",
    ]


def test_memory_check_best_effort_does_not_fail_when_memory_is_absent():
    result = consultation_smoke.evaluate_memory_check(
        {
            "memory_context_used": False,
            "memory_used_sources": [],
        },
        None,
        mode="best-effort",
        endpoint_error=None,
    )

    assert result["memory_check"] == "absent"
    assert result["ok"] is True
    assert "second SSE run did not expose agent_state_snapshots or agent_trace_log" in result["warnings"]


def test_memory_check_required_needs_stream_and_endpoint_signals():
    success = consultation_smoke.evaluate_memory_check(
        {
            "memory_context_used": True,
            "memory_used_sources": ["agent_trace_log"],
        },
        {
            "recent_continuity_signals": ["follow-up scheduled"],
            "matched_snapshot_ids": [],
            "matched_trace_ids": ["trace-row-1"],
        },
        mode="required",
        endpoint_error=None,
    )
    failure = consultation_smoke.evaluate_memory_check(
        {
            "memory_context_used": False,
            "memory_used_sources": [],
        },
        {
            "recent_continuity_signals": [],
            "matched_snapshot_ids": [],
            "matched_trace_ids": [],
        },
        mode="required",
        endpoint_error=None,
    )

    assert success["memory_check"] == "present"
    assert success["ok"] is True
    assert failure["memory_check"] == "absent"
    assert failure["ok"] is False
