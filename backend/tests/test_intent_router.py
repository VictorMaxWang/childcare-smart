from fastapi.testclient import TestClient
import pytest

from app.main import app


client = TestClient(app)


@pytest.mark.parametrize(
    ("payload", "expected_role", "expected_intent", "expected_workflow", "expected_page", "expected_kind"),
    [
        (
            {"message": "请帮我记录观察并跟进", "roleHint": "teacher", "childId": "c-1"},
            "teacher",
            "record_observation",
            "teacher.react.run",
            "/teacher/agent",
            "teacher-react-run",
        ),
        (
            {"message": "给家长发一条沟通草稿", "roleHint": "teacher", "childId": "c-2"},
            "teacher",
            "generate_parent_draft",
            "teacher.agent.communication",
            "/teacher/agent",
            "teacher-agent-run",
        ),
        (
            {"message": "这个孩子需要高风险会诊", "roleHint": "teacher", "childId": "c-3"},
            "teacher",
            "start_consultation",
            "teacher.consultation.high-risk",
            "/teacher/high-risk-consultation",
            "teacher-consultation-run",
        ),
        (
            {"message": "帮我出本周观察周报", "sourcePage": "/teacher/agent"},
            "teacher",
            "ask_weekly_report",
            "teacher.agent.weekly-summary",
            "/teacher/agent",
            "teacher-agent-run",
        ),
        (
            {"message": "最近一周饮食趋势怎么样", "roleHint": "parent", "childId": "c-4"},
            "parent",
            "query_trend",
            "parent.trend.query",
            "/parent/agent",
            "parent-trend-query",
        ),
        (
            {"message": "今晚家庭行动我该做什么", "roleHint": "parent", "childId": "c-5"},
            "parent",
            "view_tonight_action",
            "parent.agent.suggestions",
            "/parent/agent",
            "parent-agent-run",
        ),
        (
            {"message": "打开今晚的睡前故事绘本", "childId": "c-6"},
            "parent",
            "ask_storybook",
            "parent.storybook",
            "/parent/storybook",
            "parent-storybook-run",
        ),
        (
            {"message": "今天机构优先级 top 3 是什么", "roleHint": "admin"},
            "admin",
            "view_priority",
            "admin.agent.daily-priority",
            "/admin/agent",
            "admin-agent-run",
        ),
        (
            {"message": "生成本周运营周报", "roleHint": "admin"},
            "admin",
            "ask_weekly_report",
            "admin.agent.weekly-ops-report",
            "/admin/agent",
            "admin-agent-run",
        ),
    ],
)
def test_intent_router_endpoint_routes_supported_intents(
    payload,
    expected_role,
    expected_intent,
    expected_workflow,
    expected_page,
    expected_kind,
):
    response = client.post("/api/v1/agents/intent-router", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["detectedRole"] == expected_role
    assert body["intent"] == expected_intent
    assert body["targetWorkflow"] == expected_workflow
    assert body["targetPage"] == expected_page
    assert body["deeplink"].startswith(expected_page)
    assert body["previewCard"]["title"]
    assert body["optionalPayload"]["kind"] == expected_kind


def test_intent_router_endpoint_honors_role_hint_on_conflict():
    response = client.post(
        "/api/v1/agents/intent-router",
        json={
            "message": "打开今晚的睡前故事绘本",
            "roleHint": "teacher",
            "childId": "c-8",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["detectedRole"] == "teacher"
    assert body["intent"] == "unknown"
    assert body["targetWorkflow"] == ""
    assert body["optionalPayload"] is None


def test_intent_router_endpoint_returns_unknown_fallback():
    response = client.post(
        "/api/v1/agents/intent-router",
        json={"message": "随便聊聊今天怎么样"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["detectedRole"] == "unknown"
    assert body["intent"] == "unknown"
    assert body["targetPage"] == "/"
    assert body["deeplink"] == "/"
    assert body["optionalPayload"] is None
    assert "unknown-intent" in body["previewCard"]["badges"]


def test_intent_router_endpoint_routes_homepage_priority_presets():
    teacher_response = client.post(
        "/api/v1/agents/intent-router",
        json={
            "message": "帮我看看今天最需要优先处理的孩子",
            "roleHint": "teacher",
            "sourcePage": "/teacher",
        },
    )

    assert teacher_response.status_code == 200
    teacher_body = teacher_response.json()
    assert teacher_body["detectedRole"] == "teacher"
    assert teacher_body["intent"] == "view_priority"
    assert teacher_body["targetWorkflow"] == "teacher.agent.follow-up"
    assert teacher_body["targetPage"] == "/teacher/agent"
    assert teacher_body["deeplink"] == "/teacher/agent?action=follow-up"
    assert teacher_body["optionalPayload"]["kind"] == "teacher-agent-run"
    assert teacher_body["optionalPayload"]["workflow"] == "follow-up"
    assert teacher_body["ruleId"] == "intent-router:teacher:view_priority:v1"
    assert "teacher" in teacher_body["previewCard"]["badges"]
    assert "view_priority" in teacher_body["previewCard"]["badges"]
    assert "roleHint:teacher" in teacher_body["matchedSignals"]
    assert "intent:优先" in teacher_body["matchedSignals"]
    assert "intent:最需要优先处理" in teacher_body["matchedSignals"]
    assert "intent:优先处理的孩子" in teacher_body["matchedSignals"]

    admin_response = client.post(
        "/api/v1/agents/intent-router",
        json={
            "message": "帮我看今天机构最该先处理什么",
            "roleHint": "admin",
            "sourcePage": "/admin",
        },
    )

    assert admin_response.status_code == 200
    admin_body = admin_response.json()
    assert admin_body["detectedRole"] == "admin"
    assert admin_body["intent"] == "view_priority"
    assert admin_body["targetWorkflow"] == "admin.agent.daily-priority"
    assert admin_body["targetPage"] == "/admin/agent"
    assert admin_body["deeplink"] == "/admin/agent"
    assert admin_body["optionalPayload"]["kind"] == "admin-agent-run"
    assert admin_body["optionalPayload"]["workflow"] == "daily-priority"
    assert admin_body["ruleId"] == "intent-router:admin:view_priority:v1"
    assert "admin" in admin_body["previewCard"]["badges"]
    assert "view_priority" in admin_body["previewCard"]["badges"]
    assert "roleHint:admin" in admin_body["matchedSignals"]
    assert "intent:最该先处理" in admin_body["matchedSignals"]
    assert "intent:最该先处理什么" in admin_body["matchedSignals"]
