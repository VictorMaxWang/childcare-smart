from fastapi.testclient import TestClient

from app.api.v1.endpoints.agents import get_orchestrator
from app.main import app


client = TestClient(app)


def build_payload() -> dict:
    return {
        "targetChildId": "child-1",
        "teacherNote": "今天入园时有点黏老师，午睡前需要更多安抚。",
        "issueSummary": "入园分离时情绪波动，午睡前需要更多陪伴。",
        "currentInterventionCard": {
            "summary": "先降低沟通压力，再观察今晚情绪和入睡情况。",
            "tonightHomeAction": "睡前先保持固定节奏，再观察孩子安静下来需要多久。",
            "reviewIn48h": "请在明早入园前反馈，48 小时内一起复盘。",
        },
        "visibleChildren": [{"id": "child-1", "name": "安安"}],
        "debugLoop": True,
    }


def test_parent_message_reflexion_endpoint_happy_path():
    response = client.post("/api/v1/agents/parent/message-reflexion", json=build_payload())

    assert response.status_code == 200
    body = response.json()
    assert "finalOutput" in body
    assert "evaluationMeta" in body
    assert "revisionCount" in body
    assert body["evaluationMeta"]["stopReason"] == "passed"
    assert body["finalOutput"]["wordingForParent"]
    assert isinstance(body["debugIterations"], list)


def test_parent_message_reflexion_endpoint_fallback_path():
    class FakeOrchestrator:
        async def parent_message_reflexion(self, payload):
            return {
                "finalOutput": {
                    "title": "安安 今晚沟通建议",
                    "summary": "先给家长一个更稳的今晚动作。",
                    "tonightActions": ["今晚先观察孩子情绪变化。"],
                    "wordingForParent": "辛苦您，今晚先观察孩子的情绪变化，明早再和老师同步。",
                    "whyThisMatters": "这样能把家庭反馈和老师观察连起来。",
                    "estimatedTime": "5-10 分钟",
                    "followUpWindow": "明早入园前反馈；48 小时内复盘。",
                    "evaluationMeta": {
                        "score": 7.2,
                        "canSend": False,
                        "problems": ["generator fallback"],
                        "revisionSuggestions": ["人工确认后再发送。"],
                        "iterationScores": [7.2],
                        "approvedIteration": None,
                        "stopReason": "generator_fallback",
                        "fallback": True,
                        "provider": "local-rule",
                        "model": "local-rule-v1",
                        "memoryContextUsed": False,
                        "decision": "revise",
                    },
                },
                "evaluationMeta": {
                    "score": 7.2,
                    "canSend": False,
                    "problems": ["generator fallback"],
                    "revisionSuggestions": ["人工确认后再发送。"],
                    "iterationScores": [7.2],
                    "approvedIteration": None,
                    "stopReason": "generator_fallback",
                    "fallback": True,
                    "provider": "local-rule",
                    "model": "local-rule-v1",
                    "memoryContextUsed": False,
                    "decision": "revise",
                },
                "revisionCount": 0,
                "source": "mock",
                "model": "local-parent-message-v1",
                "fallback": True,
                "continuityNotes": [],
                "memoryMeta": None,
                "debugIterations": None,
            }

    app.dependency_overrides[get_orchestrator] = lambda: FakeOrchestrator()
    try:
        response = client.post("/api/v1/agents/parent/message-reflexion", json=build_payload())
    finally:
        app.dependency_overrides.pop(get_orchestrator, None)

    assert response.status_code == 200
    body = response.json()
    assert body["fallback"] is True
    assert body["evaluationMeta"]["stopReason"] == "generator_fallback"
    assert body["evaluationMeta"]["canSend"] is False
