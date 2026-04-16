from __future__ import annotations

from typing import Any

from app.schemas.teacher_voice import (
    TeacherVoiceCompatCommunicationScript,
    TeacherVoiceCompatCopilotHint,
    TeacherVoiceCompatCopilotSOP,
    TeacherVoiceCompatCopilotStep,
    TeacherVoiceCompatPayload,
    TeacherVoiceDraftItem,
    TeacherVoiceMicroTrainingSOP,
    TeacherVoiceParentCommunicationScript,
    TeacherVoiceRecordCompletionHint,
    TeacherVoiceTranscriptPayload,
)


ASR_LOW_CONFIDENCE = 0.75
ROUTER_LOW_CONFIDENCE = 0.65
CATEGORY_HINT_PRIORITY = {
    "HEALTH": 0,
    "SLEEP": 1,
    "DIET": 2,
    "EMOTION": 3,
    "LEAVE": 4,
}
SOP_PRIORITY = {
    "HEALTH": 0,
    "SLEEP": 1,
    "DIET": 2,
    "EMOTION": 3,
}
COMMUNICATION_PRIORITY = {
    "HEALTH": 0,
    "LEAVE": 1,
    "SLEEP": 2,
    "DIET": 3,
    "EMOTION": 4,
}
FIELD_HINTS: dict[str, tuple[tuple[str, str, str, str], ...]] = {
    "SLEEP": (
        (
            "sleep_phase",
            "补充睡眠阶段",
            "先明确是午睡、入睡困难还是睡后惊醒，草稿才不会过泛。",
            "可以最短补一句：是午睡难入睡，还是睡着后容易惊醒？",
        ),
        (
            "sleep_duration_min",
            "补充睡眠时长",
            "睡了多久会直接影响后续对情绪和体力的判断。",
            "可以最短补一句：大约睡了多久，或几分钟后醒。",
        ),
        (
            "wake_pattern",
            "补充醒后状态",
            "是否早醒、惊醒、哭醒，会决定老师下一步观察重点。",
            "可以最短补一句：是自然醒、惊醒，还是醒后情绪明显波动？",
        ),
    ),
    "DIET": (
        (
            "meal_period",
            "补充是哪一餐",
            "不区分早餐、午餐还是点心，后续饮食判断会失真。",
            "可以最短补一句：是早餐、午餐，还是点心时段。",
        ),
        (
            "appetite",
            "补充食量表现",
            "只记吃饭事件、不记食量高低，草稿还不够稳。",
            "可以最短补一句：是吃得少、挑食，还是基本吃完。",
        ),
        (
            "hydration",
            "补充饮水情况",
            "进食和补水通常要一起看，便于后续 follow-up。",
            "可以最短补一句：今天喝水怎么样，有没有明显偏少。",
        ),
    ),
    "EMOTION": (
        (
            "trigger",
            "补充触发场景",
            "情绪记录最怕只有结果，没有触发点。",
            "可以最短补一句：是在入园分离、午睡前，还是同伴冲突后开始波动。",
        ),
        (
            "soothing_status",
            "补充安抚后变化",
            "是否被安抚下来，会直接影响老师下一步动作。",
            "可以最短补一句：安抚后有没有缓下来，大概多久稳定。",
        ),
        (
            "duration",
            "补充持续时间",
            "持续时间会帮助区分短暂波动还是需要继续跟进。",
            "可以最短补一句：情绪波动大约持续了多久。",
        ),
    ),
    "HEALTH": (
        (
            "symptoms",
            "补充主要症状",
            "只有“身体不适”太宽泛，后续记录需要具体症状。",
            "可以最短补一句：主要是咳嗽、流涕、腹泻，还是精神差。",
        ),
        (
            "temperature_c",
            "补充体温",
            "健康场景里体温是最关键的基础字段之一。",
            "可以最短补一句：如果量过体温，请补一个数值。",
        ),
        (
            "follow_up_needed",
            "补充复查安排",
            "是否需要继续观察、复测或家园联动，会影响后续 follow-up。",
            "可以最短补一句：今晚还要继续观察什么，明早需不需要再反馈。",
        ),
    ),
    "LEAVE": (
        (
            "reason",
            "补充离园/请假原因",
            "只记离园，不记原因，后续衔接容易断。",
            "可以最短补一句：是发热、咳嗽，还是家长临时请假。",
        ),
        (
            "pickup_person",
            "补充接送人",
            "接送人是园内交接的重要字段。",
            "可以最短补一句：今天是谁来接，妈妈、爸爸还是其他监护人。",
        ),
        (
            "return_expected",
            "补充返园预期",
            "返园时间影响明天的班级安排和晨检衔接。",
            "可以最短补一句：明天预计返园，还是先在家观察。",
        ),
    ),
}


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _child_label(item: TeacherVoiceDraftItem) -> str:
    return item.child_name or "孩子"


def _sorted_items(items: list[TeacherVoiceDraftItem], priorities: dict[str, int]) -> list[TeacherVoiceDraftItem]:
    return sorted(
        items,
        key=lambda item: (
            priorities.get(item.category, 99),
            -item.confidence,
            item.summary,
        ),
    )


def _missing_field_count(item: TeacherVoiceDraftItem) -> int:
    hints = FIELD_HINTS.get(item.category, ())
    return sum(1 for field_name, *_ in hints if not _has_value(item.structured_fields.get(field_name)))


def _build_record_completion_hints(
    transcript: TeacherVoiceTranscriptPayload,
    draft_items: list[TeacherVoiceDraftItem],
    warnings: list[str],
) -> list[TeacherVoiceRecordCompletionHint]:
    entries: list[tuple[int, str, str, str]] = []

    if "transcript_empty" in warnings:
        entries.append(
            (
                0,
                "请先补一条观察原句",
                "当前没有足够的原始描述，系统无法稳定生成结构化草稿。",
                "可以最短补一句：谁、什么时候、发生了什么、老师已经做了什么。",
            )
        )

    if transcript.fallback or "router_low_confidence" in warnings or (
        transcript.confidence is not None and transcript.confidence < ASR_LOW_CONFIDENCE
    ):
        entries.append(
            (
                1,
                "请再补一句更清晰的事件描述",
                "当前语音识别或理解置信度偏低，直接生成草稿会放大误差。",
                "可以最短补一句：哪个孩子、什么时间点、发生了什么、老师已经做了什么。",
            )
        )

    if "child_ref_unresolved" in warnings:
        entries.append(
            (
                2,
                "请确认孩子是谁",
                "当前记录还没有稳定映射到具体孩子，后续草稿和 follow-up 会不稳。",
                "可以最短补一句：这是哪位孩子，例如“是小明，今天午睡前哭闹”。",
            )
        )

    if "multiple_children_detected" in warnings:
        entries.append(
            (
                3,
                "建议拆成两条记录",
                "一条语音里混入多个孩子，容易让草稿确认和后续沟通混线。",
                "可以最短补一句：把两个孩子分开各说一条，分别生成草稿。",
            )
        )

    if "draft_items_empty" in warnings:
        entries.append(
            (
                4,
                "请补一个更具体的观察点",
                "当前内容还不够具体，系统还没法给出稳定草稿。",
                "可以最短补一句：补充最明显的现象、时间点和老师动作。",
            )
        )

    for item in _sorted_items(draft_items, CATEGORY_HINT_PRIORITY):
        for index, (field_name, label, reason, prompt) in enumerate(FIELD_HINTS.get(item.category, ())):
            if _has_value(item.structured_fields.get(field_name)):
                continue
            entries.append((10 + CATEGORY_HINT_PRIORITY.get(item.category, 9) * 3 + index, label, reason, prompt))

    hints: list[TeacherVoiceRecordCompletionHint] = []
    seen_labels: set[str] = set()
    for _, label, reason, prompt in sorted(entries, key=lambda item: item[0]):
        if label in seen_labels:
            continue
        seen_labels.add(label)
        hints.append(
            TeacherVoiceRecordCompletionHint(
                label=label,
                reason=reason,
                suggested_prompt=prompt,
            )
        )
        if len(hints) >= 3:
            break

    return hints


def _build_sop_for_item(item: TeacherVoiceDraftItem) -> TeacherVoiceMicroTrainingSOP | None:
    child = _child_label(item)
    structured_fields = item.structured_fields

    if item.category == "HEALTH":
        return TeacherVoiceMicroTrainingSOP(
            title=f"{child} 健康观察 SOP",
            steps=[
                "先复述主要症状，补齐体温、出现时间和精神状态。",
                "先做一轮园内复测或持续观察，再判断是否需要离园或复查。",
                "把今晚需要家长反馈的点单独记清。",
            ],
            duration_text="约30秒",
            scenario_tag="health",
        )

    if item.category == "SLEEP":
        return TeacherVoiceMicroTrainingSOP(
            title=f"{child} 睡眠记录 SOP",
            steps=[
                "先补是午睡、入睡困难还是惊醒。",
                "再记大概睡了多久，以及醒后状态。",
                "如果影响下午情绪或进食，再补一条联动观察。",
            ],
            duration_text="约30秒",
            scenario_tag="sleep",
        )

    if item.category == "DIET":
        return TeacherVoiceMicroTrainingSOP(
            title=f"{child} 饮食观察 SOP",
            steps=[
                "先补是哪一餐，再记吃了多少。",
                "再补饮水情况，避免只记进食不记补水。",
                "如果有挑食或过敏信号，单独备注触发食物。",
            ],
            duration_text="约30秒",
            scenario_tag="diet",
        )

    if item.category != "EMOTION":
        return None

    if structured_fields.get("trigger") == "separation":
        return TeacherVoiceMicroTrainingSOP(
            title=f"{child} 分离焦虑 SOP",
            steps=[
                "先确认是在入园分离还是午睡前分离场景开始波动。",
                "再记老师用了什么安抚方式，以及多久缓下来。",
                "离园前同步家长明早接送配合点。",
            ],
            duration_text="约30秒",
            scenario_tag="separation_anxiety",
        )

    return TeacherVoiceMicroTrainingSOP(
        title=f"{child} 情绪观察 SOP",
        steps=[
            "先补触发场景，避免只记结果不记原因。",
            "再记安抚方式和恢复速度。",
            "如果持续时间偏长，单独补一条后续观察点。",
        ],
        duration_text="约30秒",
        scenario_tag="emotion",
    )


def _build_micro_training_sop(draft_items: list[TeacherVoiceDraftItem]) -> list[TeacherVoiceMicroTrainingSOP]:
    sop_items: list[TeacherVoiceMicroTrainingSOP] = []
    seen_tags: set[str] = set()

    for item in _sorted_items(
        [draft_item for draft_item in draft_items if draft_item.category in SOP_PRIORITY],
        SOP_PRIORITY,
    ):
        sop = _build_sop_for_item(item)
        if sop is None or sop.scenario_tag in seen_tags:
            continue
        seen_tags.add(sop.scenario_tag)
        sop_items.append(sop)
        if len(sop_items) >= 2:
            break

    return sop_items


def _symptom_text(item: TeacherVoiceDraftItem) -> str:
    structured_fields = item.structured_fields
    symptoms = structured_fields.get("symptoms")
    if isinstance(symptoms, list):
        selected = [str(symptom).strip() for symptom in symptoms if str(symptom).strip()]
        if selected:
            return "、".join(selected[:2])
    temperature = structured_fields.get("temperature_c")
    if isinstance(temperature, (int, float)):
        return f"体温 {temperature:.1f}℃"
    return "一些身体不适信号"


def _leave_reason_text(item: TeacherVoiceDraftItem) -> str:
    reason = str(item.structured_fields.get("reason") or "").strip()
    if reason == "fever":
        return "因发热离园/请假"
    if reason == "home_observation":
        return "需在家继续观察"
    return "有一条离园/请假记录"


def _needs_caution(
    transcript: TeacherVoiceTranscriptPayload,
    warnings: list[str],
    item: TeacherVoiceDraftItem,
) -> bool:
    return (
        transcript.fallback
        or "router_low_confidence" in warnings
        or (transcript.confidence is not None and transcript.confidence < ASR_LOW_CONFIDENCE)
        or item.confidence < ROUTER_LOW_CONFIDENCE
        or _missing_field_count(item) > 0
    )


def _build_health_script(
    transcript: TeacherVoiceTranscriptPayload,
    item: TeacherVoiceDraftItem,
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    child = _child_label(item)
    symptom_text = _symptom_text(item)
    cautious = _needs_caution(transcript, warnings, item)
    follow_up_needed = bool(item.structured_fields.get("follow_up_needed"))

    short_message = (
        f"今天先观察到{child}在园里有{symptom_text}，我们已先做记录并继续观察。"
        if cautious
        else f"今天{child}在园里出现{symptom_text}，我们已完成园内记录并继续跟进。"
    )
    calm_explanation = (
        "这是一条基于园内初步观察的同步，关键信息还在继续补充确认。"
        if cautious
        else "目前重点是把园内观察和今晚在家状态连起来看，便于判断是否需要继续复查。"
    )
    follow_up_reminder = (
        "今晚请反馈体温、精神状态和是否持续不适；如已就医或需在家观察，明早再同步一次。"
        if follow_up_needed
        else "今晚请简单反馈体温和精神状态，明早返园前再告诉我们一次。"
    )
    return TeacherVoiceParentCommunicationScript(
        short_message=short_message,
        calm_explanation=calm_explanation,
        follow_up_reminder=follow_up_reminder,
    )


def _build_leave_script(
    transcript: TeacherVoiceTranscriptPayload,
    item: TeacherVoiceDraftItem,
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    child = _child_label(item)
    cautious = _needs_caution(transcript, warnings, item)

    short_message = (
        f"今天{child}{_leave_reason_text(item)}，我们已先做园内交接记录。"
        if not cautious
        else f"今天{child}有一条离园/请假记录，我们已先做园内交接。"
    )
    calm_explanation = (
        "当前主要是先把离园原因、接送和返园安排补充确认，避免明天衔接断线。"
        if cautious
        else "目前重点是看今晚状态和明早安排，再判断是否需要继续在家观察。"
    )
    follow_up_reminder = "今晚请反馈在家观察结果；如明早返园或继续请假，请尽早告诉我们。"
    return TeacherVoiceParentCommunicationScript(
        short_message=short_message,
        calm_explanation=calm_explanation,
        follow_up_reminder=follow_up_reminder,
    )


def _build_sleep_script(
    transcript: TeacherVoiceTranscriptPayload,
    item: TeacherVoiceDraftItem,
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    child = _child_label(item)
    cautious = _needs_caution(transcript, warnings, item)

    return TeacherVoiceParentCommunicationScript(
        short_message=f"今天{child}的睡眠情况有一点波动，我们先同步给您。",
        calm_explanation=(
            "这更像园内初步观察，是否是连续性睡眠问题，还需要结合今晚作息继续判断。"
            if cautious
            else "睡眠波动需要结合今晚作息一起看连续性，我们会和明早状态一起判断。"
        ),
        follow_up_reminder="今晚请反馈入睡时间、夜间是否易醒；明早如果仍明显波动，请继续告诉我们。",
    )


def _build_diet_script(
    transcript: TeacherVoiceTranscriptPayload,
    item: TeacherVoiceDraftItem,
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    child = _child_label(item)
    cautious = _needs_caution(transcript, warnings, item)

    return TeacherVoiceParentCommunicationScript(
        short_message=f"今天{child}在园里的进食或饮水情况有些波动，我们先同步一下。",
        calm_explanation=(
            "这条记录主要用于提醒连续观察，目前还在补齐是哪一餐、食量和饮水情况。"
            if cautious
            else "我们会把园内进食表现和今晚在家情况连起来看，避免只凭单次表现下结论。"
        ),
        follow_up_reminder="今晚请反馈晚餐食量、饮水和是否有不适反应，明早如仍异常请继续告知。",
    )


def _build_emotion_script(
    transcript: TeacherVoiceTranscriptPayload,
    item: TeacherVoiceDraftItem,
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    child = _child_label(item)
    cautious = _needs_caution(transcript, warnings, item)
    separation_trigger = item.structured_fields.get("trigger") == "separation"

    short_message = (
        f"今天{child}在分离场景下出现情绪波动，我们已先做安抚记录。"
        if separation_trigger
        else f"今天{child}在园里有一段情绪波动，我们已先做安抚观察。"
    )
    calm_explanation = (
        "这类情况通常要看触发场景和安抚后恢复情况，目前先按初步观察同步给您。"
        if cautious
        else "情绪波动需要结合触发点和恢复速度一起看，我们会继续关注连续性。"
    )
    follow_up_reminder = (
        "今晚请简单反馈离园后的情绪恢复情况，明早入园前也可提醒接送节奏。"
        if separation_trigger
        else "今晚请简单反馈回家后的情绪恢复情况，明早如仍有波动请继续告诉我们。"
    )
    return TeacherVoiceParentCommunicationScript(
        short_message=short_message,
        calm_explanation=calm_explanation,
        follow_up_reminder=follow_up_reminder,
    )


def _build_generic_script(transcript: TeacherVoiceTranscriptPayload) -> TeacherVoiceParentCommunicationScript:
    if transcript.text.strip():
        return TeacherVoiceParentCommunicationScript(
            short_message="今天这条在园观察我们已先记录，但关键信息还在补充确认中。",
            calm_explanation="为了避免误读，我们会先把孩子、时间点和主要现象补齐，再形成更稳的后续记录。",
            follow_up_reminder="如果今晚有继续观察结果，明早可以补充孩子状态，便于园内衔接。",
        )
    return TeacherVoiceParentCommunicationScript(
        short_message="今天这条记录还没有形成稳定观察结论。",
        calm_explanation="当前信息不足，我们会先补齐原始观察，再决定是否需要进一步沟通。",
        follow_up_reminder="如今晚出现新的观察结果，明早可继续补充给老师。",
    )


def _build_parent_communication_script(
    transcript: TeacherVoiceTranscriptPayload,
    draft_items: list[TeacherVoiceDraftItem],
    warnings: list[str],
) -> TeacherVoiceParentCommunicationScript:
    ordered_items = _sorted_items(draft_items, COMMUNICATION_PRIORITY)
    if not ordered_items:
        return _build_generic_script(transcript)

    item = ordered_items[0]
    if item.category == "HEALTH":
        return _build_health_script(transcript, item, warnings)
    if item.category == "LEAVE":
        return _build_leave_script(transcript, item, warnings)
    if item.category == "SLEEP":
        return _build_sleep_script(transcript, item, warnings)
    if item.category == "DIET":
        return _build_diet_script(transcript, item, warnings)
    return _build_emotion_script(transcript, item, warnings)


def build_teacher_voice_copilot(
    transcript: TeacherVoiceTranscriptPayload,
    draft_items: list[TeacherVoiceDraftItem],
    warnings: list[str],
) -> tuple[
    list[TeacherVoiceRecordCompletionHint],
    list[TeacherVoiceMicroTrainingSOP],
    TeacherVoiceParentCommunicationScript,
]:
    return (
        _build_record_completion_hints(transcript, draft_items, warnings),
        _build_micro_training_sop(draft_items),
        _build_parent_communication_script(transcript, draft_items, warnings),
    )


def build_teacher_voice_copilot_compat(
    record_completion_hints: list[TeacherVoiceRecordCompletionHint],
    micro_training_sop: list[TeacherVoiceMicroTrainingSOP],
    parent_communication_script: TeacherVoiceParentCommunicationScript,
) -> tuple[
    TeacherVoiceCompatPayload | None,
    list[TeacherVoiceCompatCopilotHint],
    TeacherVoiceCompatCopilotSOP | None,
    TeacherVoiceCompatCommunicationScript | None,
]:
    compat_hints = [
        TeacherVoiceCompatCopilotHint(
            id=f"hint-{index + 1}",
            title=hint.label,
            detail=f"{hint.reason} {hint.suggested_prompt}".strip(),
            tone="warning",
            tags=["teacher-voice"],
        )
        for index, hint in enumerate(record_completion_hints)
    ]

    compat_sop = None
    if micro_training_sop:
        first_sop = micro_training_sop[0]
        compat_sop = TeacherVoiceCompatCopilotSOP(
            title=first_sop.title,
            summary=first_sop.steps[0] if first_sop.steps else None,
            durationLabel=first_sop.duration_text,
            steps=[
                TeacherVoiceCompatCopilotStep(title=step)
                for step in first_sop.steps
            ],
        )

    compat_script = None
    if (
        parent_communication_script.short_message
        or parent_communication_script.calm_explanation
        or parent_communication_script.follow_up_reminder
    ):
        compat_script = TeacherVoiceCompatCommunicationScript(
            title="家长沟通话术卡",
            opening=parent_communication_script.short_message or None,
            situation=parent_communication_script.calm_explanation or None,
            closing=parent_communication_script.follow_up_reminder or None,
            bullets=[
                item
                for item in [
                    parent_communication_script.short_message,
                    parent_communication_script.follow_up_reminder,
                ]
                if item
            ],
        )

    if not compat_hints and compat_sop is None and compat_script is None:
        return None, compat_hints, compat_sop, compat_script

    payload = TeacherVoiceCompatPayload(
        recordCompletionHints=compat_hints,
        microTrainingSOP=compat_sop,
        parentCommunicationScript=compat_script,
    )
    return payload, compat_hints, compat_sop, compat_script
