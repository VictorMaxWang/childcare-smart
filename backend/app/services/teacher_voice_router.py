from __future__ import annotations

import re
from collections import Counter

from app.schemas.teacher_voice import TeacherVoiceRouterResult, TeacherVoiceRouterTask


CATEGORY_PRIORITY = ["HEALTH", "LEAVE", "SLEEP", "DIET", "EMOTION"]
CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "DIET": (
        "吃饭",
        "午餐",
        "早餐",
        "晚餐",
        "点心",
        "喝水",
        "饮水",
        "饭量",
        "食欲",
        "挑食",
        "吐奶",
        "过敏",
        "牛奶",
        "水果",
        "蔬菜",
        "加餐",
    ),
    "EMOTION": (
        "哭",
        "哭闹",
        "情绪",
        "焦虑",
        "不开心",
        "生气",
        "安抚",
        "黏人",
        "冲突",
        "打架",
        "烦躁",
        "委屈",
        "害怕",
    ),
    "HEALTH": (
        "发热",
        "发烧",
        "体温",
        "咳嗽",
        "流涕",
        "鼻塞",
        "腹泻",
        "拉肚子",
        "呕吐",
        "红疹",
        "受伤",
        "不适",
        "药",
        "就医",
        "观察",
    ),
    "SLEEP": (
        "午睡",
        "入睡",
        "早醒",
        "惊醒",
        "睡觉",
        "睡眠",
        "没睡",
        "小睡",
        "睡着",
        "起床",
    ),
    "LEAVE": (
        "请假",
        "离园",
        "接走",
        "缺勤",
        "返园",
        "回家",
        "病假",
        "事假",
        "早退",
    ),
}
PRIMARY_SPLIT_RE = re.compile(r"[。；;\n]+")
SECONDARY_SPLIT_RE = re.compile(r"(?:同时|然后|还有|并且|另外|也要|也有|随后)")
TEMPERATURE_RE = re.compile(r"(\d{2}(?:\.\d)?)\s*度")
CHILD_NAME_PATTERNS = (
    re.compile(r"([一-龥]{2,4})(?=小朋友|同学|宝宝)"),
    re.compile(r"([小阿大][一-龥]{1,2})(?=(?:今天|同学|小朋友|宝宝|午睡|午餐|请假|体温|发热|哭|吃|喝|回家))"),
)
BLOCKED_CHILD_NAMES = {
    "老师",
    "家长",
    "阿姨",
    "今天",
    "下午",
    "上午",
    "中午",
    "晚上",
    "午睡",
    "午餐",
    "体温",
    "情绪",
    "离园",
}


def normalize_transcript(transcript: str) -> str:
    normalized = transcript.replace("\r\n", "\n").replace("\t", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip(" ，。；;\n")


def _split_segments(transcript: str) -> list[str]:
    segments: list[str] = []
    for primary in PRIMARY_SPLIT_RE.split(transcript):
        chunk = primary.strip(" ，,。；;")
        if not chunk:
            continue
        parts = [item.strip(" ，,。；;") for item in SECONDARY_SPLIT_RE.split(chunk)]
        segments.extend(item for item in parts if item)
    return segments or ([transcript] if transcript else [])


def _extract_child_names(segment: str, provided_child_name: str | None) -> list[str]:
    names: list[str] = []
    if provided_child_name:
        names.append(provided_child_name)
    for pattern in CHILD_NAME_PATTERNS:
        for match in pattern.findall(segment):
            candidate = match.strip()
            if candidate and candidate not in BLOCKED_CHILD_NAMES and candidate not in names:
                names.append(candidate)
    return names


def _score_segment(segment: str) -> tuple[str, dict[str, int]]:
    scores: dict[str, int] = {category: 0 for category in CATEGORY_KEYWORDS}
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in segment:
                scores[category] += 1

    if TEMPERATURE_RE.search(segment):
        scores["HEALTH"] += 2

    if "午睡" in segment and "哭" in segment:
        scores["SLEEP"] += 1
        scores["EMOTION"] += 1

    primary_category = CATEGORY_PRIORITY[-1]
    primary_score = -1
    for category in CATEGORY_PRIORITY:
        score = scores[category]
        if score > primary_score:
            primary_category = category
            primary_score = score
    return primary_category, scores


def _confidence_for_scores(primary_score: int, secondary_count: int, *, fallback: bool) -> float:
    if fallback:
        return 0.4
    return min(0.95, 0.55 + primary_score * 0.12 + secondary_count * 0.03)


def route_teacher_voice(
    transcript: str,
    *,
    child_id: str | None = None,
    child_name: str | None = None,
) -> tuple[TeacherVoiceRouterResult, list[str]]:
    normalized = normalize_transcript(transcript)
    segments = _split_segments(normalized)
    warnings: list[str] = []
    tasks: list[TeacherVoiceRouterTask] = []
    detected_child_names: set[str] = set()

    for index, segment in enumerate(segments, start=1):
        if not segment:
            continue
        primary_category, scores = _score_segment(segment)
        secondary_categories = [
            category
            for category in CATEGORY_PRIORITY
            if category != primary_category and scores.get(category, 0) > 0
        ]
        fallback = scores.get(primary_category, 0) <= 0
        if fallback:
            primary_category = "EMOTION"
            secondary_categories = []

        names = _extract_child_names(segment, child_name)
        detected_child_names.update(name for name in names if name)
        resolved_child_name = names[0] if names else child_name
        resolved_child_ref = None
        if child_id and not child_name and not names:
            resolved_child_ref = child_id
        elif child_id and resolved_child_name and resolved_child_name == child_name:
            resolved_child_ref = child_id

        tasks.append(
            TeacherVoiceRouterTask(
                task_id=f"task-{index}",
                category=primary_category,
                child_ref=resolved_child_ref,
                child_name=resolved_child_name,
                raw_excerpt=segment,
                confidence=_confidence_for_scores(
                    scores.get(primary_category, 0),
                    len(secondary_categories),
                    fallback=fallback,
                ),
                meta={
                    "keyword_hits": {category: score for category, score in scores.items() if score > 0},
                    "secondary_categories": secondary_categories,
                    "fallback": fallback,
                },
            )
        )

    if not tasks and normalized:
        tasks.append(
            TeacherVoiceRouterTask(
                task_id="task-1",
                category="EMOTION",
                child_ref=child_id,
                child_name=child_name,
                raw_excerpt=normalized,
                confidence=0.4,
                meta={"keyword_hits": {}, "secondary_categories": [], "fallback": True},
            )
        )

    category_counter = Counter(task.category for task in tasks)
    primary_category = next(iter(category_counter.keys()), "EMOTION")
    if len(category_counter) > 1:
        primary_category = "MIXED"

    is_multi_child = len(detected_child_names) > 1
    is_multi_event = len(tasks) > 1

    if is_multi_child:
        warnings.append("multiple_children_detected")
    if not child_id and any(task.child_name for task in tasks):
        warnings.append("child_ref_unresolved")
    if any(task.confidence < 0.5 for task in tasks):
        warnings.append("router_low_confidence")

    return (
        TeacherVoiceRouterResult(
            is_multi_child=is_multi_child,
            is_multi_event=is_multi_event,
            primary_category=primary_category,
            tasks=tasks,
        ),
        warnings,
    )
