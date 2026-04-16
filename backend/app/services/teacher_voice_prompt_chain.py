from __future__ import annotations

import re
from typing import Any

from app.schemas.teacher_voice import TeacherVoiceDraftItem, TeacherVoiceRouterResult, TeacherVoiceRouterTask


TEMPERATURE_RE = re.compile(r"(\d{2}(?:\.\d)?)\s*度")
DURATION_MIN_RE = re.compile(r"(\d{1,3})\s*(?:分钟|分)")
DURATION_HOUR_RE = re.compile(r"(\d{1,2}(?:\.\d)?)\s*(?:小时|h)")
COMMON_FOODS = ("米饭", "面条", "牛奶", "水果", "蔬菜", "鸡蛋", "鸡肉", "粥", "点心")
COMMON_SYMPTOMS = ("咳嗽", "流涕", "鼻塞", "腹泻", "拉肚子", "呕吐", "红疹", "发热", "发烧")
BODY_PARTS = ("喉咙", "肚子", "皮肤", "鼻子", "胃", "头", "眼睛")


def _child_label(task: TeacherVoiceRouterTask) -> str:
    return task.child_name or "未识别幼儿"


def _base_fields(category: str) -> dict[str, Any]:
    templates: dict[str, dict[str, Any]] = {
        "DIET": {
            "meal_period": None,
            "appetite": None,
            "hydration": None,
            "food_items": [],
            "allergy_flag": None,
        },
        "EMOTION": {
            "mood": None,
            "trigger": None,
            "duration": None,
            "soothing_status": None,
            "social_context": None,
        },
        "HEALTH": {
            "symptoms": [],
            "temperature_c": None,
            "body_part": None,
            "severity_hint": None,
            "follow_up_needed": None,
        },
        "SLEEP": {
            "sleep_phase": None,
            "sleep_duration_min": None,
            "sleep_quality": None,
            "wake_pattern": None,
        },
        "LEAVE": {
            "leave_type": None,
            "time_range": None,
            "reason": None,
            "pickup_person": None,
            "return_expected": None,
        },
    }
    return dict(templates[category])


def _extract_diet(task: TeacherVoiceRouterTask) -> tuple[dict[str, Any], list[str]]:
    excerpt = task.raw_excerpt
    fields = _base_fields("DIET")
    if "早餐" in excerpt:
        fields["meal_period"] = "breakfast"
    elif "午餐" in excerpt:
        fields["meal_period"] = "lunch"
    elif "晚餐" in excerpt:
        fields["meal_period"] = "dinner"
    elif "点心" in excerpt or "加餐" in excerpt:
        fields["meal_period"] = "snack"

    if "挑食" in excerpt or "饭量少" in excerpt or "食欲差" in excerpt:
        fields["appetite"] = "low"
    elif "吃得好" in excerpt or "食欲好" in excerpt:
        fields["appetite"] = "good"

    if "喝水少" in excerpt or "饮水少" in excerpt:
        fields["hydration"] = "low"
    elif "喝水" in excerpt or "饮水" in excerpt:
        fields["hydration"] = "mentioned"

    fields["food_items"] = [food for food in COMMON_FOODS if food in excerpt]
    if "过敏" in excerpt or "红疹" in excerpt:
        fields["allergy_flag"] = True
    elif fields["food_items"]:
        fields["allergy_flag"] = False

    actions = [
        "补充记录进食量和饮水量。",
        "如持续食欲下降，和家长同步今日饮食观察。",
    ]
    return fields, actions


def _extract_emotion(task: TeacherVoiceRouterTask) -> tuple[dict[str, Any], list[str]]:
    excerpt = task.raw_excerpt
    fields = _base_fields("EMOTION")
    if "哭闹" in excerpt or "哭" in excerpt:
        fields["mood"] = "crying"
    elif "焦虑" in excerpt or "害怕" in excerpt:
        fields["mood"] = "anxious"
    elif "生气" in excerpt or "冲突" in excerpt:
        fields["mood"] = "upset"
    else:
        fields["mood"] = "needs_observation"

    if "午睡前" in excerpt:
        fields["trigger"] = "before_nap"
    elif "分离" in excerpt or "家长" in excerpt:
        fields["trigger"] = "separation"

    if "安抚后" in excerpt:
        fields["soothing_status"] = "improved_after_soothing"
    elif "难安抚" in excerpt:
        fields["soothing_status"] = "hard_to_soothe"

    if "和同学" in excerpt or "冲突" in excerpt:
        fields["social_context"] = "peer_interaction"

    actions = [
        "记录触发场景和安抚方式。",
        "离园前同步家长今日情绪变化和后续观察点。",
    ]
    return fields, actions


def _extract_health(task: TeacherVoiceRouterTask) -> tuple[dict[str, Any], list[str]]:
    excerpt = task.raw_excerpt
    fields = _base_fields("HEALTH")
    fields["symptoms"] = [symptom for symptom in COMMON_SYMPTOMS if symptom in excerpt]
    if match := TEMPERATURE_RE.search(excerpt):
        fields["temperature_c"] = float(match.group(1))

    for body_part in BODY_PARTS:
        if body_part in excerpt:
            fields["body_part"] = body_part
            break

    if "就医" in excerpt or "持续" in excerpt or "高烧" in excerpt:
        fields["severity_hint"] = "high"
    elif fields["temperature_c"] is not None or fields["symptoms"]:
        fields["severity_hint"] = "medium"
    else:
        fields["severity_hint"] = "low"

    fields["follow_up_needed"] = any(token in excerpt for token in ("观察", "复查", "就医", "回家"))

    actions = [
        "补充记录症状出现时间和复查结果。",
        "如已离园或需请假，提醒家长回传观察反馈。",
    ]
    return fields, actions


def _extract_sleep(task: TeacherVoiceRouterTask) -> tuple[dict[str, Any], list[str]]:
    excerpt = task.raw_excerpt
    fields = _base_fields("SLEEP")
    if "午睡" in excerpt:
        fields["sleep_phase"] = "nap"
    elif "入睡" in excerpt:
        fields["sleep_phase"] = "fall_asleep"

    if match := DURATION_MIN_RE.search(excerpt):
        fields["sleep_duration_min"] = int(match.group(1))
    elif match := DURATION_HOUR_RE.search(excerpt):
        fields["sleep_duration_min"] = int(float(match.group(1)) * 60)

    if "惊醒" in excerpt or "早醒" in excerpt:
        fields["sleep_quality"] = "interrupted"
    elif "没睡" in excerpt:
        fields["sleep_quality"] = "poor"
    elif "睡着" in excerpt or "入睡" in excerpt:
        fields["sleep_quality"] = "settled"

    if "早醒" in excerpt:
        fields["wake_pattern"] = "early_wake"
    elif "惊醒" in excerpt:
        fields["wake_pattern"] = "sudden_wake"

    actions = [
        "记录入睡时点、持续时长和醒后状态。",
        "如睡眠波动影响情绪或健康，补充联动观察。",
    ]
    return fields, actions


def _extract_leave(task: TeacherVoiceRouterTask) -> tuple[dict[str, Any], list[str]]:
    excerpt = task.raw_excerpt
    fields = _base_fields("LEAVE")
    if "病假" in excerpt:
        fields["leave_type"] = "sick_leave"
    elif "事假" in excerpt:
        fields["leave_type"] = "personal_leave"
    elif "接走" in excerpt or "离园" in excerpt:
        fields["leave_type"] = "early_pickup"
    else:
        fields["leave_type"] = "leave_notice"

    if "上午" in excerpt:
        fields["time_range"] = "morning"
    elif "下午" in excerpt:
        fields["time_range"] = "afternoon"
    elif "今天" in excerpt:
        fields["time_range"] = "today"

    if "发热" in excerpt or "发烧" in excerpt:
        fields["reason"] = "fever"
    elif "观察" in excerpt:
        fields["reason"] = "home_observation"

    if "妈妈" in excerpt:
        fields["pickup_person"] = "mother"
    elif "爸爸" in excerpt:
        fields["pickup_person"] = "father"
    elif "家长" in excerpt:
        fields["pickup_person"] = "guardian"

    if "明天返园" in excerpt or "返园" in excerpt:
        fields["return_expected"] = "mentioned"

    actions = [
        "确认请假或离园原因、接送人与返园预期。",
        "提醒家长补充在家观察结果，便于次日衔接。",
    ]
    return fields, actions


def _summarize(task: TeacherVoiceRouterTask) -> str:
    child_label = _child_label(task)
    if task.category == "DIET":
        return f"{child_label} 今日饮食观察需要补充记录：{task.raw_excerpt}"
    if task.category == "EMOTION":
        return f"{child_label} 出现情绪相关事件：{task.raw_excerpt}"
    if task.category == "HEALTH":
        return f"{child_label} 出现健康观察信号：{task.raw_excerpt}"
    if task.category == "SLEEP":
        return f"{child_label} 睡眠相关情况需继续跟进：{task.raw_excerpt}"
    return f"{child_label} 存在请假或离园事项：{task.raw_excerpt}"


def build_draft_items(router_result: TeacherVoiceRouterResult) -> tuple[list[TeacherVoiceDraftItem], list[str]]:
    draft_items: list[TeacherVoiceDraftItem] = []
    warnings: list[str] = []

    for task in router_result.tasks:
        if task.category == "MIXED":
            warnings.append("mixed_task_unresolved")
            continue

        if task.category == "DIET":
            structured_fields, suggested_actions = _extract_diet(task)
        elif task.category == "EMOTION":
            structured_fields, suggested_actions = _extract_emotion(task)
        elif task.category == "HEALTH":
            structured_fields, suggested_actions = _extract_health(task)
        elif task.category == "SLEEP":
            structured_fields, suggested_actions = _extract_sleep(task)
        else:
            structured_fields, suggested_actions = _extract_leave(task)

        draft_items.append(
            TeacherVoiceDraftItem(
                child_ref=task.child_ref,
                child_name=task.child_name,
                category=task.category,
                summary=_summarize(task),
                structured_fields=structured_fields,
                confidence=task.confidence,
                suggested_actions=suggested_actions,
                raw_excerpt=task.raw_excerpt,
                source="rule-chain",
            )
        )

    if not draft_items:
        warnings.append("draft_items_empty")

    return draft_items, warnings
