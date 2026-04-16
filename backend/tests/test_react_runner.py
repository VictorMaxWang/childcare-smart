from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.services.orchestrator import build_memory_service, build_orchestrator, reset_orchestrator_runtime


def configure_memory_backend(monkeypatch, *, backend: str, sqlite_path: str | None = None):
    monkeypatch.setenv("BRAIN_MEMORY_BACKEND", backend)
    if sqlite_path is not None:
        monkeypatch.setenv("BRAIN_MEMORY_SQLITE_PATH", sqlite_path)
    else:
        monkeypatch.delenv("BRAIN_MEMORY_SQLITE_PATH", raising=False)

    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    get_settings.cache_clear()
    reset_repository_bundle_cache()
    reset_orchestrator_runtime()


def seed_profile_memory():
    memory = build_memory_service()
    asyncio.run(
        memory.upsert_child_profile_memory(
            "c-8",
            {
                "sleepPattern": "午睡前需要固定过渡和安抚。",
                "supportStrategies": ["先抱一会儿再引导躺下", "使用固定午睡提醒语"],
            },
            source="teacher-agent",
        )
    )
    asyncio.run(
        memory.upsert_child_profile_memory(
            "c-11",
            {
                "dietPreferences": ["偏爱主食和肉类", "对绿叶菜接受度低"],
                "supportStrategies": ["分量减少后逐步尝试蔬菜", "正向表扬每次新尝试"],
            },
            source="teacher-agent",
        )
    )


def build_request_snapshot_for_diet() -> dict:
    return {
        "children": [
            {
                "id": "c-11",
                "name": "周诗雨",
                "nickname": "诗诗",
                "institutionId": "inst-test",
                "className": "向日葵班",
            }
        ],
        "attendance": [],
        "meals": [
            {
                "id": "meal-1",
                "childId": "c-11",
                "date": "2026-04-03",
                "meal": "lunch",
                "foods": ["米饭", "青菜", "鸡肉"],
                "intakeLevel": "low",
                "preference": "dislike",
                "waterMl": 120,
                "nutritionScore": 66,
                "aiEvaluation": {"summary": "只吃鸡肉，青菜未动。"},
            },
            {
                "id": "meal-2",
                "childId": "c-11",
                "date": "2026-04-02",
                "meal": "lunch",
                "foods": ["面条", "胡萝卜", "牛肉丸"],
                "intakeLevel": "low",
                "preference": "dislike",
                "waterMl": 110,
                "nutritionScore": 63,
                "aiEvaluation": {"summary": "挑出胡萝卜，只吃面和牛肉丸。"},
            },
            {
                "id": "meal-3",
                "childId": "c-11",
                "date": "2026-04-01",
                "meal": "lunch",
                "foods": ["米饭", "西兰花", "鸡蛋"],
                "intakeLevel": "medium",
                "preference": "dislike",
                "waterMl": 140,
                "nutritionScore": 70,
                "aiEvaluation": {"summary": "对西兰花明显回避。"},
            },
        ],
        "growth": [],
        "feedback": [],
        "health": [],
        "taskCheckIns": [],
        "interventionCards": [],
        "consultations": [],
        "mobileDrafts": [],
        "reminders": [],
        "updatedAt": "2026-04-04T00:00:00Z",
    }


def test_react_runner_sleep_chain_uses_query_and_action_tools_with_trace(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "react-memory.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_profile_memory()

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/agents/react/run",
            json={
                "task": "黄嘉豪今天午睡又哭了，查查前几天是不是也这样，顺便给家长发提醒",
                "role": "teacher",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["scenario"] == "sleep_distress_notify"
    assert body["targetChild"]["childId"] == "c-8"
    assert body["final"]["judgement"]["repeatedSleepDistress"] is True
    assert any(item["tool"] == "get_recent_observations" for item in body["toolCalls"])
    assert any(item["tool"] == "trigger_parent_notification" for item in body["toolCalls"])
    assert body["fallback"] is True
    assert len(body["trace"]["steps"]) >= 6

    orchestrator = build_orchestrator()
    traces = asyncio.run(orchestrator.memory.get_recent_traces(trace_id=body["traceId"], limit=20))
    snapshots = asyncio.run(orchestrator.repositories.list_recent_snapshots(limit=20, session_id=body["traceId"]))

    assert any(item.trace_id == body["traceId"] and item.action_type == "final" for item in traces)
    assert any(item.snapshot_type == "react-run-result" for item in snapshots)


def test_react_runner_diet_chain_writes_draft_summary_from_request_snapshot(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "react-memory-diet.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_profile_memory()

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/agents/react/run",
            json={
                "task": "查一下周诗雨近 7 天饮食记录，判断是否有偏食趋势，并写入一个待跟进项",
                "role": "teacher",
                "appSnapshot": build_request_snapshot_for_diet(),
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["scenario"] == "diet_trend_follow_up"
    assert body["targetChild"]["childId"] == "c-11"
    assert body["final"]["judgement"]["pickyEatingTrend"] is True
    assert any(item["tool"] == "write_draft_record" for item in body["toolCalls"])
    assert body["persistence"]["businessDataSource"] == "request_snapshot"
    assert body["persistence"]["businessDataPersisted"] is False
    assert body["fallback"] is False


def test_react_runner_returns_structured_failure_for_unsupported_task(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "react-memory-unsupported.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/agents/react/run",
            json={
                "task": "帮我总结今天的班级气氛",
                "role": "teacher",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["final"]["error"]["code"] == "unsupported_task"
