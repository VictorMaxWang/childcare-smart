from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from app.schemas.intent_router import (
    IntentRouterConfidence,
    IntentRouterDetectedRole,
    IntentRouterIntent,
    IntentRouterOptionalPayload,
    IntentRouterPreviewCard,
    IntentRouterRequest,
    IntentRouterResponse,
    SupportedIntent,
)


WEEKLY_REPORT_KEYWORDS = (
    "weekly report",
    "weekly summary",
    "ops report",
    "周报",
    "本周总结",
    "本周观察",
    "运营周报",
    "本周运营",
)
STORYBOOK_KEYWORDS = ("storybook", "story book", "绘本", "故事", "睡前故事", "微绘本")
CONSULTATION_KEYWORDS = (
    "consultation",
    "high risk",
    "high-risk",
    "会诊",
    "高风险",
    "升级关注",
    "升级处理",
)
PRIORITY_KEYWORDS = (
    "priority",
    "top 3",
    "top3",
    "p1",
    "最该先处理",
    "最该先处理什么",
    "最需要优先处理",
    "优先处理的孩子",
    "优先",
    "优先级",
    "最该处理",
    "机构重点",
    "园所重点",
)
TREND_KEYWORDS = (
    "trend",
    "变化",
    "趋势",
    "最近",
    "这周",
    "本周",
    "上周",
    "一个月",
    "睡眠",
    "饮食",
    "情绪",
    "健康",
    "成长",
)
PARENT_DRAFT_KEYWORDS = (
    "parent draft",
    "message to parent",
    "notify parent",
    "家长沟通",
    "家长消息",
    "家长草稿",
    "给家长",
)
TONIGHT_ACTION_KEYWORDS = (
    "tonight",
    "home action",
    "今晚",
    "今晚上",
    "家庭行动",
    "今晚做什么",
    "今晚任务",
)
OBSERVATION_KEYWORDS = (
    "observation",
    "record observation",
    "note",
    "记录观察",
    "观察记录",
    "记一下",
    "记录一下",
    "记个观察",
)
ADMIN_ROLE_KEYWORDS = ("admin", "director", "institution", "ops", "园长", "管理端", "机构", "园所", "运营")
PARENT_ROLE_KEYWORDS = ("parent", "family", "guardian", "家长", "家庭", "在家", "睡前")
TEACHER_ROLE_KEYWORDS = ("teacher", "classroom", "observation", "follow up", "follow-up", "老师", "班级", "园内", "观察")


def _normalize_message(value: str) -> str:
    return value.strip().lower()


def _contains_any(message: str, keywords: tuple[str, ...]) -> list[str]:
    return [keyword for keyword in keywords if keyword in message]


def _append_query(path: str, items: list[tuple[str, str | None]]) -> str:
    params = [(key, value) for key, value in items if value]
    query = urlencode(params)
    return f"{path}?{query}" if query else path


def _detect_intent(payload: IntentRouterRequest) -> tuple[IntentRouterIntent, list[str]]:
    normalized = _normalize_message(payload.message)
    checks: list[tuple[SupportedIntent, tuple[str, ...]]] = [
        ("ask_storybook", STORYBOOK_KEYWORDS),
        ("start_consultation", CONSULTATION_KEYWORDS),
        ("view_priority", PRIORITY_KEYWORDS),
        ("ask_weekly_report", WEEKLY_REPORT_KEYWORDS),
        ("query_trend", TREND_KEYWORDS),
        ("generate_parent_draft", PARENT_DRAFT_KEYWORDS),
        ("view_tonight_action", TONIGHT_ACTION_KEYWORDS),
        ("record_observation", OBSERVATION_KEYWORDS),
    ]
    for intent, keywords in checks:
        hits = _contains_any(normalized, keywords)
        if hits:
            return intent, [f"intent:{item}" for item in hits]
    return "unknown", []


def _detect_role(payload: IntentRouterRequest, intent_signals: list[str]) -> tuple[IntentRouterDetectedRole, IntentRouterConfidence, list[str]]:
    if payload.role_hint:
        return payload.role_hint, "high", [f"roleHint:{payload.role_hint}", *intent_signals]

    source_page = payload.source_page or ""
    if source_page.startswith("/teacher"):
        return "teacher", "medium", ["sourcePage:/teacher", *intent_signals]
    if source_page.startswith("/parent"):
        return "parent", "medium", ["sourcePage:/parent", *intent_signals]
    if source_page.startswith("/admin"):
        return "admin", "medium", ["sourcePage:/admin", *intent_signals]

    normalized = _normalize_message(payload.message)
    admin_hits = _contains_any(normalized, ADMIN_ROLE_KEYWORDS)
    parent_hits = _contains_any(normalized, PARENT_ROLE_KEYWORDS)
    teacher_hits = _contains_any(normalized, TEACHER_ROLE_KEYWORDS)

    if admin_hits:
        return "admin", "medium", [*[f"role:{item}" for item in admin_hits], *intent_signals]
    if parent_hits:
        return "parent", "medium", [*[f"role:{item}" for item in parent_hits], *intent_signals]
    if teacher_hits:
        return "teacher", "medium", [*[f"role:{item}" for item in teacher_hits], *intent_signals]
    return "unknown", "low", intent_signals


def _infer_role_from_intent(intent: IntentRouterIntent) -> IntentRouterDetectedRole:
    if intent in {"record_observation", "generate_parent_draft", "start_consultation"}:
        return "teacher"
    if intent in {"query_trend", "view_tonight_action", "ask_storybook"}:
        return "parent"
    if intent == "view_priority":
        return "admin"
    return "unknown"


def _preview_card(title: str, summary: str, cta_label: str, badges: list[str]) -> IntentRouterPreviewCard:
    return IntentRouterPreviewCard(title=title, summary=summary, cta_label=cta_label, badges=badges)


def _optional_payload(kind: str, *, message: str, **extra: Any) -> IntentRouterOptionalPayload:
    return IntentRouterOptionalPayload(kind=kind, message=message, **extra)


def _build_unknown_result(detected_role: IntentRouterDetectedRole, matched_signals: list[str]) -> IntentRouterResponse:
    return IntentRouterResponse(
        detected_role=detected_role,
        intent="unknown",
        target_workflow="",
        target_page="/",
        deeplink="/",
        preview_card=_preview_card(
            "需要人工确认意图",
            "当前规则无法稳定判断目标工作流，先回到通用入口确认角色与目标。",
            "回到入口",
            [detected_role, "unknown-intent"] if detected_role != "unknown" else ["unknown-role", "unknown-intent"],
        ),
        optional_payload=None,
        rule_id="intent-router:unknown:v1",
        confidence="low",
        matched_signals=matched_signals,
    )


def route_intent(payload: IntentRouterRequest | dict[str, Any]) -> dict[str, Any]:
    request = payload if isinstance(payload, IntentRouterRequest) else IntentRouterRequest.model_validate(payload)
    intent, intent_signals = _detect_intent(request)
    detected_role, role_confidence, matched_signals = _detect_role(request, intent_signals)
    effective_role = detected_role if detected_role != "unknown" else _infer_role_from_intent(intent)

    response: IntentRouterResponse

    if effective_role == "teacher" and intent == "record_observation":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="teacher.react.run",
            target_page="/teacher/agent",
            deeplink=_append_query("/teacher/agent", [("childId", request.child_id), ("intent", "record_observation")]),
            preview_card=_preview_card(
                "记录老师观察并进入后续动作",
                "将自然语言观察路由到 teacher ReAct 链路，用于生成结构化记录和后续动作建议。",
                "打开教师助手",
                ["teacher", "record_observation"],
            ),
            optional_payload=_optional_payload(
                "teacher-react-run",
                message=request.message,
                task=request.message,
                child_id=request.child_id,
            ),
            rule_id="intent-router:teacher:record_observation:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "teacher" and intent == "generate_parent_draft":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="teacher.agent.communication",
            target_page="/teacher/agent",
            deeplink=_append_query("/teacher/agent", [("action", "communication"), ("childId", request.child_id)]),
            preview_card=_preview_card(
                "生成家长沟通草稿",
                "将当前诉求路由到教师家长沟通工作流，复用已有 communication 输出。",
                "生成沟通建议",
                ["teacher", "generate_parent_draft"],
            ),
            optional_payload=_optional_payload(
                "teacher-agent-run",
                message=request.message,
                workflow="communication",
                child_id=request.child_id,
            ),
            rule_id="intent-router:teacher:generate_parent_draft:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "teacher" and intent == "start_consultation":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="teacher.consultation.high-risk",
            target_page="/teacher/high-risk-consultation",
            deeplink=_append_query(
                "/teacher/high-risk-consultation",
                [("intent", "start_consultation"), ("childId", request.child_id)],
            ),
            preview_card=_preview_card(
                "升级到高风险会诊",
                "将当前诉求路由到教师高风险会诊入口，保留 childId 和原始 message 供后续执行。",
                "打开高风险会诊",
                ["teacher", "start_consultation"],
            ),
            optional_payload=_optional_payload(
                "teacher-consultation-run",
                message=request.message,
                child_id=request.child_id,
            ),
            rule_id="intent-router:teacher:start_consultation:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "teacher" and intent == "view_priority":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="teacher.agent.follow-up",
            target_page="/teacher/agent",
            deeplink=_append_query("/teacher/agent", [("action", "follow-up"), ("childId", request.child_id)]),
            preview_card=_preview_card(
                "查看今日优先处理孩子",
                "将当前诉求路由到教师今日跟进工作流，优先打开最需要先处理的孩子与后续动作。",
                "打开今日跟进",
                ["teacher", "view_priority"],
            ),
            optional_payload=_optional_payload(
                "teacher-agent-run",
                message=request.message,
                workflow="follow-up",
                child_id=request.child_id,
            ),
            rule_id="intent-router:teacher:view_priority:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "teacher" and intent == "ask_weekly_report":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="teacher.agent.weekly-summary",
            target_page="/teacher/agent",
            deeplink=_append_query("/teacher/agent", [("action", "weekly-summary")]),
            preview_card=_preview_card(
                "生成教师周观察总结",
                "将请求路由到教师 weekly-summary 工作流，不依赖首页入口即可测试。",
                "打开教师周总结",
                ["teacher", "ask_weekly_report"],
            ),
            optional_payload=_optional_payload(
                "teacher-agent-run",
                message=request.message,
                workflow="weekly-summary",
                child_id=request.child_id,
            ),
            rule_id="intent-router:teacher:ask_weekly_report:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "parent" and intent == "query_trend":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="parent.trend.query",
            target_page="/parent/agent",
            deeplink=_append_query("/parent/agent", [("child", request.child_id), ("intent", "query_trend")]),
            preview_card=_preview_card(
                "查看家长趋势问答",
                "将问题路由到 parent trend query，后续可直接调用现有趋势查询接口。",
                "打开趋势问答",
                ["parent", "query_trend"],
            ),
            optional_payload=_optional_payload(
                "parent-trend-query",
                message=request.message,
                question=request.message,
                child_id=request.child_id,
            ),
            rule_id="intent-router:parent:query_trend:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "parent" and intent == "view_tonight_action":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="parent.agent.suggestions",
            target_page="/parent/agent",
            deeplink=f"{_append_query('/parent/agent', [('child', request.child_id)])}#intervention",
            preview_card=_preview_card(
                "查看今晚家庭行动",
                "将诉求路由到家长建议入口，并直接定位到 intervention 区域。",
                "打开今晚行动",
                ["parent", "view_tonight_action"],
            ),
            optional_payload=_optional_payload(
                "parent-agent-run",
                message=request.message,
                workflow="suggestions",
                child_id=request.child_id,
                anchor="intervention",
            ),
            rule_id="intent-router:parent:view_tonight_action:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "parent" and intent == "ask_storybook":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="parent.storybook",
            target_page="/parent/storybook",
            deeplink=_append_query("/parent/storybook", [("child", request.child_id)]),
            preview_card=_preview_card(
                "打开家长微绘本",
                "将请求路由到 parent storybook，复用现有绘本生成页和后端接口。",
                "打开微绘本",
                ["parent", "ask_storybook"],
            ),
            optional_payload=_optional_payload(
                "parent-storybook-run",
                message=request.message,
                child_id=request.child_id,
            ),
            rule_id="intent-router:parent:ask_storybook:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "admin" and intent == "view_priority":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="admin.agent.daily-priority",
            target_page="/admin/agent",
            deeplink="/admin/agent",
            preview_card=_preview_card(
                "查看机构优先级",
                "将请求路由到 admin daily-priority 工作流，便于直接定位机构级重点事项。",
                "打开机构优先级",
                ["admin", "view_priority"],
            ),
            optional_payload=_optional_payload(
                "admin-agent-run",
                message=request.message,
                workflow="daily-priority",
                institution_id=request.institution_id,
            ),
            rule_id="intent-router:admin:view_priority:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    elif effective_role == "admin" and intent == "ask_weekly_report":
        response = IntentRouterResponse(
            detected_role=effective_role,
            intent=intent,
            target_workflow="admin.agent.weekly-ops-report",
            target_page="/admin/agent",
            deeplink="/admin/agent?action=weekly-report",
            preview_card=_preview_card(
                "生成机构周报",
                "将请求路由到 admin weekly-ops-report 工作流，复用现有周报模式入口。",
                "打开机构周报",
                ["admin", "ask_weekly_report"],
            ),
            optional_payload=_optional_payload(
                "admin-agent-run",
                message=request.message,
                workflow="weekly-ops-report",
                institution_id=request.institution_id,
            ),
            rule_id="intent-router:admin:ask_weekly_report:v1",
            confidence="medium",
            matched_signals=matched_signals,
        )
    else:
        response = _build_unknown_result(effective_role, matched_signals)

    if request.role_hint:
        response.confidence = role_confidence
    elif response.intent != "unknown" and effective_role != "unknown" and response.confidence == "medium" and role_confidence != "low":
        response.confidence = role_confidence

    return response.model_dump(mode="json", by_alias=True)
