from __future__ import annotations

from typing import Any

from app.providers.base import ProviderResult, ProviderTextResult
from app.db.demo_snapshot import build_demo_admin_payload, build_demo_child_service_payload
from app.services.weekly_report_contract import build_actionized_weekly_report, resolve_weekly_report_role
from app.tools.risk_tools import compute_priority_level, compute_risk_level, pick_target_child, score_snapshot
from app.tools.summary_tools import first_non_empty, iso_now, safe_dict, safe_list, unique_texts


class MockTextProvider:
    provider_name = "mock-brain"

    def summarize(self, prompt: str, fallback: str) -> ProviderTextResult:
        return ProviderTextResult(
            text=fallback,
            source="mock",
            content=fallback,
            model="mock-brain-v1",
            provider=self.provider_name,
            fallback=True,
            meta={"reason": "mock-provider"},
        )


def _child_name(payload: dict[str, Any], default: str = "目标儿童") -> str:
    target = pick_target_child(payload)
    if target:
        return str(target.get("name") or default)

    snapshot = safe_dict(payload.get("snapshot"))
    child = safe_dict(snapshot.get("child"))
    if child:
        return str(child.get("name") or default)

    current_user = safe_dict(payload.get("currentUser"))
    return str(current_user.get("name") or default)


def _summary(payload: dict[str, Any]) -> dict[str, Any]:
    snapshot = safe_dict(payload.get("snapshot"))
    return safe_dict(snapshot.get("summary"))


def _preferred_demo_child_id(payload: dict[str, Any]) -> str | None:
    target_child_id = str(payload.get("targetChildId") or "").strip()
    if target_child_id:
        return target_child_id

    target = pick_target_child(payload)
    picked_child_id = str(safe_dict(target).get("id") or "").strip()
    if picked_child_id:
        return picked_child_id

    snapshot_child = safe_dict(safe_dict(payload.get("snapshot")).get("child"))
    snapshot_child_id = str(snapshot_child.get("id") or "").strip()
    if snapshot_child_id:
        return snapshot_child_id

    question = str(payload.get("question") or "").strip()
    if any(token in question for token in ("饮水", "补水", "喝水", "water", "hydration")):
        return "c-15"
    if any(token in question for token in ("偏食", "挑食", "蔬菜", "diet", "meal", "eating")):
        return "c-11"
    return None


def _hydrate_demo_payload(payload: dict[str, Any], *, mode: str) -> dict[str, Any]:
    demo_payload = (
        build_demo_admin_payload()
        if mode in {"admin", "weekly"}
        else build_demo_child_service_payload(target_child_id=_preferred_demo_child_id(payload))
    )

    next_payload = dict(payload)
    for key in ("targetChildId", "visibleChildren", "presentChildren", "healthCheckRecords", "growthRecords", "guardianFeedbacks"):
        if next_payload.get(key):
            continue
        if demo_payload.get(key):
            next_payload[key] = demo_payload[key]

    current_user = safe_dict(payload.get("currentUser"))
    demo_user = safe_dict(demo_payload.get("currentUser"))
    if demo_user:
        merged_user = dict(demo_user)
        merged_user.update(current_user)
        next_payload["currentUser"] = merged_user

    snapshot = safe_dict(payload.get("snapshot"))
    demo_snapshot = safe_dict(demo_payload.get("snapshot"))
    if demo_snapshot:
        merged_snapshot = dict(snapshot)
        for key, value in demo_snapshot.items():
            if key in {"overview", "summary", "child"}:
                section = safe_dict(snapshot.get(key))
                if section:
                    merged_section = dict(safe_dict(value))
                    merged_section.update(section)
                    merged_snapshot[key] = merged_section
                elif value:
                    merged_snapshot[key] = value
                continue
            if key not in merged_snapshot or not merged_snapshot.get(key):
                merged_snapshot[key] = value
        next_payload["snapshot"] = merged_snapshot

    return next_payload


def _auto_context(payload: dict[str, Any], child_name: str) -> dict[str, Any]:
    health_records = safe_list(payload.get("healthCheckRecords"))
    growth_records = safe_list(payload.get("growthRecords"))
    feedbacks = safe_list(payload.get("guardianFeedbacks"))
    current_user = safe_dict(payload.get("currentUser"))
    class_name = str(current_user.get("className") or "当前班级")

    morning_check_alerts = []
    for record in health_records[:3]:
        item = safe_dict(record)
        if item.get("isAbnormal"):
            morning_check_alerts.append(
                f"{item.get('date', '今日')} 晨检异常，体温 {item.get('temperature', '--')}，情绪 {item.get('mood', '待观察')}"
            )

    pending_review_notes = []
    for record in growth_records[:3]:
        item = safe_dict(record)
        if str(item.get("reviewStatus") or "").strip():
            pending_review_notes.append(
                f"{item.get('category', '观察项')}：{item.get('followUpAction') or item.get('description') or '待补充复查动作'}"
            )

    parent_feedback_notes = []
    for record in feedbacks[:3]:
        item = safe_dict(record)
        parent_feedback_notes.append(f"{item.get('date', 'recent')} {item.get('status', '反馈')}：{item.get('content', '')}")

    focus_reasons = unique_texts(
        [
            *morning_check_alerts,
            *pending_review_notes,
            parent_feedback_notes[0] if parent_feedback_notes else "",
            f"{child_name} 已进入教师主动会诊流程",
        ],
        limit=4,
    )

    return {
        "childId": str(payload.get("targetChildId") or "child-unknown"),
        "childName": child_name,
        "className": class_name,
        "morningCheckAlerts": morning_check_alerts or ["今日暂无明确晨检异常，采用会诊演示上下文。"],
        "pendingReviewNotes": pending_review_notes or ["暂无待复查记录，建议补一条 48 小时复查点。"],
        "growthObservationNotes": unique_texts(
            [
                f"{safe_dict(item).get('category', '行为观察')}：{safe_dict(item).get('description', '待补充')}"
                for item in growth_records[:4]
            ],
            limit=4,
        )
        or ["近 7 天成长观察波动需要继续跟踪。"],
        "parentFeedbackNotes": parent_feedback_notes or ["最近家庭侧反馈不足，需要今天晚上形成闭环。"],
        "classSignals": [
            f"班级：{class_name}",
            f"在场儿童：{len(safe_list(payload.get('presentChildren')))} 人",
            f"成长观察：{len(growth_records)} 条",
            f"家长反馈：{len(feedbacks)} 条",
        ],
        "focusReasons": focus_reasons,
    }


def _memory_contexts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    contexts = [safe_dict(item) for item in safe_list(payload.get("memory_contexts"))]
    primary = safe_dict(payload.get("memory_context"))
    if primary:
        contexts = [primary, *contexts]
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for item in contexts:
        child_id = str(item.get("child_id") or "")
        workflow_type = str(item.get("workflow_type") or "")
        key = (child_id, workflow_type)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _memory_prompt_context(payload: dict[str, Any]) -> dict[str, list[str]]:
    long_term_traits: list[str] = []
    recent_continuity_signals: list[str] = []
    last_consultation_takeaways: list[str] = []
    open_loops: list[str] = []

    for context in _memory_contexts(payload):
        prompt_context = safe_dict(context.get("prompt_context"))
        long_term_traits.extend(str(item) for item in safe_list(prompt_context.get("long_term_traits")))
        recent_continuity_signals.extend(
            str(item) for item in safe_list(prompt_context.get("recent_continuity_signals"))
        )
        last_consultation_takeaways.extend(
            str(item) for item in safe_list(prompt_context.get("last_consultation_takeaways"))
        )
        open_loops.extend(str(item) for item in safe_list(prompt_context.get("open_loops")))

    return {
        "long_term_traits": unique_texts(long_term_traits, limit=6),
        "recent_continuity_signals": unique_texts(recent_continuity_signals, limit=6),
        "last_consultation_takeaways": unique_texts(last_consultation_takeaways, limit=6),
        "open_loops": unique_texts(open_loops, limit=6),
    }


def _continuity_notes(payload: dict[str, Any], child_name: str, limit: int = 4) -> list[str]:
    prompt_context = _memory_prompt_context(payload)
    notes = []
    if prompt_context["long_term_traits"]:
        notes.append(f"参考了 {child_name} 的长期画像：{prompt_context['long_term_traits'][0]}")
    if prompt_context["last_consultation_takeaways"]:
        notes.append(f"延续最近一次会诊：{prompt_context['last_consultation_takeaways'][0]}")
    if prompt_context["recent_continuity_signals"]:
        notes.append(f"结合近期连续上下文：{prompt_context['recent_continuity_signals'][0]}")
    if prompt_context["open_loops"]:
        notes.append(f"本轮仍需盯住：{prompt_context['open_loops'][0]}")
    return unique_texts(notes, limit=limit)


def _memory_meta(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not payload.get("debugMemory"):
        return None

    contexts = _memory_contexts(payload)
    used_sources: list[str] = []
    matched_snapshot_ids: list[str] = []
    matched_trace_ids: list[str] = []
    errors: list[str] = []
    degraded = False

    for context in contexts:
        meta = safe_dict(context.get("meta"))
        used_sources.extend(str(item) for item in safe_list(meta.get("used_sources")))
        matched_snapshot_ids.extend(str(item) for item in safe_list(meta.get("matched_snapshot_ids")))
        matched_trace_ids.extend(str(item) for item in safe_list(meta.get("matched_trace_ids")))
        errors.extend(str(item) for item in safe_list(meta.get("errors")))
        degraded = degraded or bool(meta.get("degraded"))

    trace_meta = safe_dict(payload.get("_memory_trace_meta"))
    return {
        "usedSources": unique_texts(used_sources, limit=8),
        "matchedSnapshotIds": unique_texts(matched_snapshot_ids, limit=8),
        "matchedTraceIds": unique_texts(matched_trace_ids, limit=8),
        "errors": unique_texts(errors, limit=6),
        "degraded": degraded,
        **trace_meta,
    }


def _attach_memory_fields(payload: dict[str, Any], result: dict[str, Any], child_name: str) -> dict[str, Any]:
    continuity_notes = _continuity_notes(payload, child_name)
    next_result = dict(result)
    if continuity_notes:
        next_result["continuityNotes"] = continuity_notes

    memory_meta = _memory_meta(payload)
    if memory_meta is not None:
        next_result["memoryMeta"] = memory_meta

    return next_result


def _build_intervention_card(
    *,
    child_id: str,
    child_name: str,
    summary: str,
    risk_level: str,
    tonight_home_action: str,
    observation_points: list[str],
    review_in_48h: str,
    consultation_id: str | None = None,
) -> dict[str, Any]:
    return {
        "id": f"card-{child_id}",
        "title": f"{child_name} 干预卡",
        "riskLevel": risk_level,
        "targetChildId": child_id,
        "triggerReason": "系统识别到需要当天闭环的重点风险",
        "summary": summary,
        "todayInSchoolAction": "今天园内先补齐观察记录，并同步班级老师执行复查。",
        "tonightHomeAction": tonight_home_action,
        "homeSteps": [
            tonight_home_action,
            "记录孩子执行后的情绪、作息和进食变化。",
            "明早把关键变化同步给老师。",
        ],
        "observationPoints": observation_points,
        "tomorrowObservationPoint": "明早重点观察情绪、精神状态和家庭反馈是否一致。",
        "reviewIn48h": review_in_48h,
        "parentMessageDraft": f"今晚请优先配合：{tonight_home_action}，并补充孩子的即时反应。",
        "teacherFollowupDraft": f"明天继续跟进 {child_name}，48 小时内复盘：{review_in_48h}",
        "consultationMode": bool(consultation_id),
        "consultationId": consultation_id,
        "consultationSummary": summary if consultation_id else None,
        "participants": ["health-agent", "diet-agent", "coparenting-agent", "execution-agent", "coordinator"],
        "shouldEscalateToAdmin": risk_level == "high",
        "source": "mock",
        "model": "mock-brain-v1",
    }


def build_mock_suggestion(payload: dict[str, Any]) -> dict[str, Any]:
    summary = _summary(payload)
    score = score_snapshot(summary)
    child_name = _child_name(payload)
    risk_level = compute_risk_level(score)
    prompt_context = _memory_prompt_context(payload)
    continuity_notes = _continuity_notes(payload, child_name)

    result = {
        "riskLevel": risk_level,
        "summary": first_non_empty(
            [
                continuity_notes[0] if continuity_notes else "",
                f"{child_name} 当前更适合先处理当天最紧急的闭环动作，再安排家庭协同反馈。",
            ],
            f"{child_name} 当前更适合先处理当天最紧急的闭环动作，再安排家庭协同反馈。",
        ),
        "highlights": unique_texts(
            [
                f"{child_name} 的风险等级为 {risk_level}",
                *prompt_context["long_term_traits"][:1],
                *prompt_context["recent_continuity_signals"][:1],
                "今天先补齐园内观察，再同步晚间家庭动作。",
                "保留 48 小时复查点，避免建议只有一次性输出。",
            ],
            limit=4,
        ),
        "concerns": unique_texts(
            [
                "近期记录和家长反馈之间仍有信息差。",
                "如果今晚没有形成反馈，明天的判断会继续偏弱。",
                *prompt_context["open_loops"][:2],
            ],
            limit=4,
        ),
        "actions": unique_texts(
            [
                "今天园内先完成最关键的一条观察或复查记录。",
                "离园前明确今晚家庭要执行的一个动作。",
                "48 小时内复盘执行结果并决定是否升级会诊。",
                *prompt_context["last_consultation_takeaways"][:1],
            ],
            limit=4,
        ),
        "actionPlan": {
            "schoolActions": unique_texts(
                [
                    "今天园内先补齐观察记录，并向班级老师同步风险点。",
                    "必要时发起一次重点儿童内部复核。",
                    *prompt_context["recent_continuity_signals"][:1],
                ],
                limit=3,
            ),
            "familyActions": unique_texts(
                [
                    "今晚先完成一条明确的家庭观察动作。",
                    "把孩子的即时反应和家长备注反馈回来。",
                    *prompt_context["open_loops"][:1],
                ],
                limit=3,
            ),
            "reviewActions": unique_texts(
                [
                    "48 小时内复查孩子状态并更新跟进结论。",
                    *prompt_context["last_consultation_takeaways"][:1],
                ],
                limit=2,
            ),
        },
        "trendPrediction": "down" if score >= 75 else "stable",
        "disclaimer": "当前为 FastAPI mock 输出，用于前后端联调。",
        "source": "mock",
        "model": "mock-suggestion-v1",
    }
    return _attach_memory_fields(payload, result, child_name)


def build_mock_follow_up(payload: dict[str, Any]) -> dict[str, Any]:
    child_name = _child_name(payload)
    question = str(payload.get("question") or "下一步应该怎么做？").strip()
    prompt_context = _memory_prompt_context(payload)
    continuity_notes = _continuity_notes(payload, child_name)
    result = {
        "answer": first_non_empty(
            [
                continuity_notes[0] if continuity_notes else "",
                f"围绕“{question}”，建议先把 {child_name} 今晚要执行的动作说清楚，再约定明早反馈点。",
            ],
            f"围绕“{question}”，建议先把 {child_name} 今晚要执行的动作说清楚，再约定明早反馈点。",
        ),
        "keyPoints": unique_texts(
            [
                "优先选择今晚就能完成的一条动作。",
                "把观察点写成老师和家长都能复述的话。",
                "48 小时内再判断是否需要升级处理。",
                *prompt_context["long_term_traits"][:1],
                *prompt_context["last_consultation_takeaways"][:1],
            ],
            limit=4,
        ),
        "nextSteps": unique_texts(
            [
                "今晚先执行一个家庭动作。",
                "明早补充一条教师侧观察。",
                "48 小时后复盘是否改善。",
                *prompt_context["open_loops"][:1],
            ],
            limit=4,
        ),
        "tonightTopAction": "今晚优先记录孩子的情绪、进食和入睡表现。",
        "whyNow": first_non_empty(
            [
                prompt_context["recent_continuity_signals"][0] if prompt_context["recent_continuity_signals"] else "",
                f"{child_name} 的上下文还在变化，越早形成家庭侧反馈，明天越容易闭环。",
            ],
            f"{child_name} 的上下文还在变化，越早形成家庭侧反馈，明天越容易闭环。",
        ),
        "homeSteps": unique_texts(
            [
                "记录孩子执行动作后的即时反应。",
                "如果出现新的异常，及时补充备注。",
                "明早将反馈同步给老师。",
                *prompt_context["open_loops"][:1],
            ],
            limit=4,
        ),
        "observationPoints": unique_texts(
            ["情绪是否更稳定", "进食是否更配合", "入睡和晨起状态是否改善", *prompt_context["long_term_traits"][:1]],
            limit=4,
        ),
        "teacherObservation": "明早优先核对家庭反馈与园内观察是否一致。",
        "reviewIn48h": "48 小时内结合家庭反馈与园内观察做一次复盘。",
        "recommendedQuestions": unique_texts(
            [
                "今晚最先做哪一步？",
                "哪些变化需要立刻告诉老师？",
                "48 小时后如何判断是否改善？",
            ],
            limit=3,
        ),
        "disclaimer": "当前为 FastAPI mock 输出，用于前后端联调。",
        "source": "mock",
        "model": "mock-follow-up-v1",
    }
    return _attach_memory_fields(payload, result, child_name)


def build_mock_weekly_report(payload: dict[str, Any]) -> dict[str, Any]:
    payload = _hydrate_demo_payload(payload, mode="weekly")
    snapshot = safe_dict(payload.get("snapshot"))
    role = resolve_weekly_report_role(payload) or "admin"
    age_band_context = safe_dict(snapshot.get("ageBandContext"))
    age_band_policy = safe_dict(age_band_context.get("policy"))
    institution_name = str(snapshot.get("institutionName") or "机构")
    period = str(snapshot.get("periodLabel") or "本周")
    overview = safe_dict(snapshot.get("overview"))
    attendance_rate = int(overview.get("attendanceRate") or 0)
    prompt_context = _memory_prompt_context(payload)
    continuity_notes = _continuity_notes(payload, institution_name)

    if role == "parent" and age_band_policy:
        weekly_focus = unique_texts(
            [str(item) for item in safe_list(age_band_policy.get("weeklyReportFocus")) if str(item).strip()],
            limit=2,
        )
        default_actions = unique_texts(
            [str(item) for item in safe_list(age_band_policy.get("defaultInterventionFocus")) if str(item).strip()],
            limit=2,
        )
        do_not_overstate = unique_texts(
            [str(item) for item in safe_list(age_band_policy.get("doNotOverstateSignals")) if str(item).strip()],
            limit=2,
        )
        parent_action_tone = str(age_band_policy.get("parentActionTone") or "").strip()
        age_band_label = {"0-12m": "0-12月", "12-24m": "12-24月", "24-36m": "24-36月"}.get(
            str(age_band_policy.get("ageBand") or ""),
            "当前月龄",
        )
        focus_text = "、".join(weekly_focus[:2]) if weekly_focus else "当前照护重点"
        primary_action = default_actions[0] if default_actions else "保留一条稳定、容易复现的家庭动作"

        return build_actionized_weekly_report(
            role=role,
            snapshot=snapshot,
            summary=first_non_empty(
                [
                    continuity_notes[0] if continuity_notes else "",
                    f"{period}里更建议围绕{focus_text}做连续复盘；{age_band_label}阶段家长动作以{parent_action_tone or '安稳、轻量的小动作配合'}为主。",
                ],
                f"{period}里更建议围绕{focus_text}做连续复盘；{age_band_label}阶段家长动作以{parent_action_tone or '安稳、轻量的小动作配合'}为主。",
            ),
            highlights=unique_texts(
                [
                    f"{age_band_label}阶段本周先看{focus_text}这些照护变化。",
                    *safe_list(snapshot.get("highlights"))[:2],
                    *prompt_context["recent_continuity_signals"][:1],
                ],
                limit=4,
            ),
            risks=unique_texts(
                [
                    do_not_overstate[0] if do_not_overstate else "",
                    *safe_list(snapshot.get("risks"))[:2],
                    *prompt_context["open_loops"][:1],
                ],
                limit=4,
            ),
            next_week_actions=unique_texts(
                [
                    f"下周先围绕{primary_action}保留一条最重要的家庭动作。",
                    f"如果你观察到{focus_text}有变化，请尽量在当天回传给老师。",
                    do_not_overstate[0] if do_not_overstate else "",
                    *prompt_context["last_consultation_takeaways"][:1],
                ],
                limit=4,
            ),
            trend_prediction="stable" if attendance_rate >= 80 else "down",
            disclaimer="褰撳墠涓?FastAPI mock 杈撳嚭锛岀敤浜庡墠鍚庣鑱旇皟銆?",
            source="mock",
            model="mock-weekly-report-v1",
            continuity_notes=continuity_notes,
            memory_meta=_memory_meta(payload),
        )

    result = build_actionized_weekly_report(
        role=role,
        snapshot=snapshot,
        summary=first_non_empty(
            [continuity_notes[0] if continuity_notes else "", f"{institution_name} {period} 整体运行稳定，重点仍在家园反馈闭环和重点儿童复查。"],
            f"{institution_name} {period} 整体运行稳定，重点仍在家园反馈闭环和重点儿童复查。",
        ),
        highlights=unique_texts(
            [
                "重点儿童清单已经形成，可继续用作下周派单依据。",
                "本周数据已具备教师端和园长端联动展示价值。",
                "家园协同开始从单次提醒转向连续闭环。",
                *prompt_context["long_term_traits"][:1],
                *prompt_context["recent_continuity_signals"][:2],
            ],
            limit=5,
        ),
        risks=unique_texts(
            [
                "如果晚间反馈覆盖率继续偏低，下周判断仍会偏弱。",
                "待复查项目需要在周初集中处理，避免拖延。",
                *prompt_context["open_loops"][:2],
            ],
            limit=4,
        ),
        next_week_actions=unique_texts(
            [
                "周一先排重点儿童复查顺序。",
                "把家长反馈完成率作为固定追踪指标。",
                "保留一条高风险会诊演示链路作为比赛亮点。",
                *prompt_context["last_consultation_takeaways"][:2],
            ],
            limit=5,
        ),
        trend_prediction="stable" if attendance_rate >= 80 else "down",
        disclaimer="当前为 FastAPI mock 输出，用于前后端联调。",
        source="mock",
        model="mock-weekly-report-v1",
        continuity_notes=continuity_notes,
        memory_meta=_memory_meta(payload),
    )
    return result


def build_mock_teacher_result(payload: dict[str, Any]) -> dict[str, Any]:
    payload = _hydrate_demo_payload(payload, mode="teacher")
    workflow = str(payload.get("workflow") or "follow-up")
    scope = str(payload.get("scope") or "child")
    target_child = pick_target_child(payload)
    child_id = str(target_child.get("id") or payload.get("targetChildId") or "child-unknown")
    child_name = str(target_child.get("name") or "目标儿童")
    generated_at = iso_now()
    prompt_context = _memory_prompt_context(payload)
    continuity_notes = _continuity_notes(payload, child_name)

    summary = first_non_empty(
        [
            continuity_notes[0] if continuity_notes else "",
            (
                f"围绕 {child_name}，建议今天先完成园内记录和家园同步，再把复查点留到明天早上。"
                if scope == "child"
                else "班级当前更适合按异常晨检、待复查、家长反馈不足三个层次推进。"
            ),
        ],
        f"围绕 {child_name}，建议今天先完成园内记录和家园同步，再把复查点留到明天早上。"
        if scope == "child"
        else "班级当前更适合按异常晨检、待复查、家长反馈不足三个层次推进。",
    )
    highlights = unique_texts(
        [
            f"工作流：{workflow}",
            f"模式：{scope}",
            *prompt_context["long_term_traits"][:1],
            *prompt_context["recent_continuity_signals"][:1],
            "先做当天闭环，再做 48 小时复查。",
            f"目标：{child_name if scope == 'child' else '当前班级'}",
        ],
        limit=5,
    )
    action_items = [
        {
            "id": "teacher-1",
            "target": child_name if scope == "child" else "重点儿童",
            "reason": first_non_empty(
                [prompt_context["recent_continuity_signals"][0] if prompt_context["recent_continuity_signals"] else "", "需要先完成园内可执行动作"],
                "需要先完成园内可执行动作",
            ),
            "action": first_non_empty(
                [prompt_context["open_loops"][0] if prompt_context["open_loops"] else "", "补齐观察记录，并同步班级老师。"],
                "补齐观察记录，并同步班级老师。",
            ),
            "timing": "today",
        },
        {
            "id": "teacher-2",
            "target": "家长",
            "reason": "需要形成今晚的家庭反馈",
            "action": first_non_empty(
                [prompt_context["last_consultation_takeaways"][0] if prompt_context["last_consultation_takeaways"] else "", "明确晚间家庭观察动作并约定明早反馈。"],
                "明确晚间家庭观察动作并约定明早反馈。",
            ),
            "timing": "tonight",
        },
    ]

    result: dict[str, Any] = {
        "workflow": workflow,
        "mode": scope,
        "title": "教师 Agent",
        "summary": summary,
        "objectScope": scope,
        "targetChildId": child_id if scope == "child" else None,
        "targetLabel": child_name if scope == "child" else str(safe_dict(payload.get("currentUser")).get("className") or "当前班级"),
        "highlights": highlights,
        "actionItems": action_items,
        "parentMessageDraft": first_non_empty(
            [
                continuity_notes[1] if len(continuity_notes) > 1 else "",
                f"今晚请优先配合观察 {child_name} 的情绪、作息和进食变化，并明早反馈。",
            ],
            f"今晚请优先配合观察 {child_name} 的情绪、作息和进食变化，并明早反馈。",
        ),
        "tomorrowObservationPoint": first_non_empty(
            [
                prompt_context["open_loops"][0] if prompt_context["open_loops"] else "",
                "明早优先核对家庭反馈、晨检状态和今日记录是否一致。",
            ],
            "明早优先核对家庭反馈、晨检状态和今日记录是否一致。",
        ),
        "keyChildren": [child_name] if scope == "child" else [child_name],
        "riskTypes": ["health", "follow-up", "feedback"],
        "source": "mock",
        "model": "mock-teacher-agent-v1",
        "generatedAt": generated_at,
    }

    result["interventionCard"] = _build_intervention_card(
        child_id=child_id,
        child_name=child_name,
        summary=summary,
        risk_level="medium",
        tonight_home_action="今晚优先记录孩子的情绪、进食和入睡表现。",
        observation_points=["情绪是否稳定", "是否愿意进食", "入睡是否顺利"],
        review_in_48h="48 小时内复查孩子状态并更新跟进结论。",
    )
    return _attach_memory_fields(payload, result, child_name)


def build_mock_admin_result(payload: dict[str, Any]) -> dict[str, Any]:
    payload = _hydrate_demo_payload(payload, mode="admin")
    workflow = str(payload.get("workflow") or "daily-priority")
    visible_children = [safe_dict(item) for item in safe_list(payload.get("visibleChildren"))]
    class_names = unique_texts([str(item.get("className") or "未分班") for item in visible_children], limit=20)
    child_count = len(visible_children)
    class_count = len(class_names) or 1
    priority_level = compute_priority_level(max(child_count * 8, 60))
    generated_at = iso_now()
    overview = safe_dict(safe_dict(payload.get("snapshot")).get("overview"))

    institution_scope = {
        "institutionName": str(safe_dict(payload.get("currentUser")).get("institutionName") or "智慧托育示范园"),
        "date": generated_at[:10],
        "visibleChildren": int(overview.get("visibleChildren") or child_count),
        "classCount": int(overview.get("classCount") or class_count),
        "attendanceRate": int(overview.get("attendanceRate") or 92),
        "healthAbnormalCount": int(overview.get("healthAbnormalCount") or max(1, min(3, child_count // 4 or 1))),
        "growthAttentionCount": int(overview.get("growthAttentionCount") or max(1, min(4, child_count // 3 or 1))),
        "pendingReviewCount": int(overview.get("pendingReviewCount") or max(1, min(4, child_count // 5 or 1))),
        "feedbackCount": int(overview.get("feedbackCount") or len(safe_list(payload.get("guardianFeedbacks")))),
        "feedbackCompletionRate": int(overview.get("feedbackCompletionRate") or 78),
        "riskChildrenCount": int(overview.get("riskChildrenCount") or max(1, min(3, child_count // 4 or 1))),
        "riskClassCount": int(overview.get("riskClassCount") or max(1, min(2, class_count))),
        "pendingDispatchCount": 2,
    }
    priority_item = {
        "id": "priority-1",
        "targetType": "child",
        "targetId": str(visible_children[0].get("id") or "child-1") if visible_children else "child-1",
        "targetName": str(visible_children[0].get("name") or "重点儿童 A") if visible_children else "重点儿童 A",
        "priorityScore": 88,
        "priorityLevel": "P1",
        "reason": "晨检异常与待复查在同一名儿童上叠加，需要今天先闭环。",
        "evidence": [
            {"label": "晨检异常", "value": "1", "weight": 0.5, "detail": "今日出现异常记录"},
            {"label": "待复查", "value": "1", "weight": 0.3, "detail": "48 小时复查尚未闭环"},
            {"label": "反馈不足", "value": "1", "weight": 0.2, "detail": "家庭侧反馈覆盖不足"},
        ],
        "recommendedOwner": {
            "role": "teacher",
            "label": "班级老师",
            "className": class_names[0] if class_names else "示例班级",
            "childName": str(visible_children[0].get("name") or "重点儿童 A") if visible_children else "重点儿童 A",
        },
        "recommendedAction": "今天内完成复查记录，并向家长同步晚间动作。",
        "recommendedDeadline": "today",
        "relatedChildIds": [str(visible_children[0].get("id") or "child-1")] if visible_children else ["child-1"],
        "relatedClassNames": [class_names[0] if class_names else "示例班级"],
        "dispatchPayload": {
            "eventType": "risk-follow-up",
            "priorityItemId": "priority-1",
            "title": "重点儿童闭环派单",
            "summary": "先完成高优先级儿童的当天闭环动作。",
            "targetType": "child",
            "targetId": str(visible_children[0].get("id") or "child-1") if visible_children else "child-1",
            "targetName": str(visible_children[0].get("name") or "重点儿童 A") if visible_children else "重点儿童 A",
            "priorityLevel": "P1",
            "priorityScore": 88,
            "recommendedOwnerRole": "teacher",
            "recommendedOwnerName": "班级老师",
            "recommendedAction": "今天内完成复查记录，并向家长同步晚间动作。",
            "recommendedDeadline": "today",
            "reasonText": "晨检异常、待复查和反馈不足叠加。",
            "evidence": [
                {"label": "晨检异常", "value": "1", "weight": 0.5, "detail": "今日出现异常记录"},
            ],
            "source": {
                "institutionName": institution_scope["institutionName"],
                "workflow": workflow,
                "relatedChildIds": [str(visible_children[0].get("id") or "child-1")] if visible_children else ["child-1"],
                "relatedClassNames": [class_names[0] if class_names else "示例班级"],
            },
        },
    }
    notification_event = {
        "id": "dispatch-1",
        "institutionId": str(safe_dict(payload.get("currentUser")).get("institutionId") or "institution-1"),
        "eventType": "risk-follow-up",
        "status": "pending",
        "priorityItemId": "priority-1",
        "title": "重点儿童闭环派单",
        "summary": "今天先完成重点儿童复查，再同步家庭动作。",
        "targetType": "child",
        "targetId": priority_item["targetId"],
        "targetName": priority_item["targetName"],
        "priorityLevel": "P1",
        "priorityScore": 88,
        "recommendedOwnerRole": "teacher",
        "recommendedOwnerName": "班级老师",
        "recommendedAction": "今天内完成复查记录，并向家长同步晚间动作。",
        "recommendedDeadline": "today",
        "reasonText": "需要把风险处置从建议升级为派单。",
        "evidence": priority_item["evidence"],
        "source": priority_item["dispatchPayload"]["source"],
        "createdBy": "mock-admin-agent",
        "updatedBy": "mock-admin-agent",
        "createdAt": generated_at,
        "updatedAt": generated_at,
        "completedAt": None,
    }

    result = {
        "title": "园长 Agent",
        "summary": "建议先处理 P1 风险儿童，再推动重点班级和家园反馈闭环。",
        "assistantAnswer": first_non_empty(
            [
                str(payload.get("question") or "").strip(),
                "先压实最高优先级动作，再推进派单和复盘。",
            ],
            "先压实最高优先级动作，再推进派单和复盘。",
        ),
        "institutionScope": institution_scope,
        "priorityTopItems": [priority_item],
        "riskChildren": [
            {
                "childId": priority_item["targetId"],
                "childName": priority_item["targetName"],
                "className": class_names[0] if class_names else "示例班级",
                "priorityLevel": "P1",
                "priorityScore": 88,
                "reason": priority_item["reason"],
                "ownerLabel": "班级老师",
                "deadline": "today",
            }
        ],
        "riskClasses": [
            {
                "className": class_names[0] if class_names else "示例班级",
                "priorityLevel": priority_level,
                "priorityScore": 74,
                "reason": "该班级近期需要重点处理晨检异常和待复查叠加问题。",
                "issueCount": 2,
                "ownerLabel": "年级负责人",
                "deadline": "this-week",
            }
        ],
        "feedbackRiskItems": [
            {
                "childId": priority_item["targetId"],
                "childName": priority_item["targetName"],
                "className": class_names[0] if class_names else "示例班级",
                "priorityLevel": "P2",
                "reason": "最近家庭反馈覆盖不足，影响持续判断。",
                "lastFeedbackDate": generated_at[:10],
                "recommendedOwner": "班级老师",
            }
        ],
        "highlights": [
            "教师侧跟进、园长侧派单、家长侧反馈已经可以形成闭环叙事。",
            "重点儿童、重点班级和待派单事项都已结构化输出。",
            "当前结果适合作为比赛演示中的机构大脑层。",
        ],
        "actionItems": [
            {
                "id": "admin-action-1",
                "title": "创建重点儿童派单",
                "targetType": "child",
                "targetId": priority_item["targetId"],
                "targetName": priority_item["targetName"],
                "priorityLevel": "P1",
                "ownerRole": "teacher",
                "ownerLabel": "班级老师",
                "action": "今天内完成复查并同步家长。",
                "deadline": "today",
                "summary": "将建议转成明确的执行动作。",
                "dispatchPayload": priority_item["dispatchPayload"],
                "status": "suggested",
            }
        ],
        "recommendedOwnerMap": [
            {"ownerRole": "teacher", "ownerLabel": "班级老师", "count": 1},
            {"ownerRole": "admin", "ownerLabel": "园长", "count": 1},
        ],
        "quickQuestions": [
            "今天最先处理哪一项？",
            "要不要立刻生成派单？",
            "下周机构侧应该固定追踪什么？",
        ],
        "notificationEvents": [notification_event],
        "source": "mock",
        "model": "mock-admin-agent-v1",
        "generatedAt": generated_at,
    }
    return _attach_memory_fields(payload, result, institution_scope["institutionName"])


def build_mock_high_risk_bundle(payload: dict[str, Any]) -> dict[str, Any]:
    payload = _hydrate_demo_payload(payload, mode="high-risk")
    child_name = _child_name(payload)
    child_id = str(payload.get("targetChildId") or pick_target_child(payload).get("id") or "child-unknown")
    generated_at = iso_now()
    consultation_id = f"consultation-{child_id}"
    prompt_context = _memory_prompt_context(payload)
    continuity_notes = _continuity_notes(payload, child_name, limit=4)
    summary = first_non_empty(
        [
            continuity_notes[0] if continuity_notes else "",
            f"{child_name} 已进入高风险会诊闭环，建议今天先补齐园内记录，今晚形成家庭反馈。",
        ],
        f"{child_name} 已进入高风险会诊闭环，建议今天先补齐园内记录，今晚形成家庭反馈。",
    )
    observation_points = ["情绪波动", "进食与饮水", "入睡与晨起状态"]
    review_in_48h = "48 小时内复查执行结果，并决定是否继续升级。"
    auto_context = _auto_context(payload, child_name)

    consultation = {
        "consultationId": consultation_id,
        "triggerReason": "教师主动发起高风险会诊",
        "triggerType": ["multi-risk"],
        "triggerReasons": auto_context["focusReasons"][:3] or ["需要启动高风险闭环"],
        "participants": [
            {"id": "health-agent", "label": "健康观察"},
            {"id": "diet-agent", "label": "饮食行为"},
            {"id": "coparenting-agent", "label": "家园沟通"},
            {"id": "execution-agent", "label": "园内执行"},
            {"id": "coordinator", "label": "协调中枢"},
        ],
        "childId": child_id,
        "riskLevel": "high",
        "agentFindings": [
            {
                "agentId": "health-agent",
                "title": "健康观察",
                "riskExplanation": "晨检异常和后续观察需要放到同一条闭环里处理。",
                "signals": auto_context["morningCheckAlerts"][:2],
                "actions": ["今天补齐晨检复查记录。"],
                "observationPoints": observation_points[:2],
                "evidence": ["mock-health-evidence"],
            },
            {
                "agentId": "coparenting-agent",
                "title": "家园协同",
                "riskExplanation": "如果今晚没有家庭反馈，明天的判断仍会偏弱。",
                "signals": auto_context["parentFeedbackNotes"][:2],
                "actions": ["今晚形成一条明确的家庭动作和回传。"],
                "observationPoints": ["家长是否执行", "孩子是否配合"],
                "evidence": ["mock-parent-evidence"],
            },
        ],
        "summary": summary,
        "keyFindings": unique_texts(
            [
                "当前最需要的是当天闭环，而不是再堆叠更多建议。",
                "家庭侧反馈是明天继续判断的关键输入。",
                "需要保留 48 小时复查点来验证执行效果。",
                *prompt_context["last_consultation_takeaways"][:2],
            ],
            limit=5,
        ),
        "healthAgentView": {
            "role": "HealthObservationAgent",
            "title": "健康观察",
            "summary": first_non_empty(
                [
                    prompt_context["recent_continuity_signals"][0] if prompt_context["recent_continuity_signals"] else "",
                    "今天园内先补齐关键观察记录。",
                ],
                "今天园内先补齐关键观察记录。",
            ),
            "signals": unique_texts(auto_context["morningCheckAlerts"][:2] + prompt_context["long_term_traits"][:1], limit=3),
            "actions": ["补一条晨检或复查记录", "同步班级老师观察结论"],
            "observationPoints": observation_points[:2],
            "evidence": ["mock-health-evidence"],
        },
        "dietBehaviorAgentView": {
            "role": "DietBehaviorAgent",
            "title": "饮食行为",
            "summary": "关注进食、饮水和作息是否一起波动。",
            "signals": auto_context["growthObservationNotes"][:2],
            "actions": ["补充饮食与饮水观察", "记录晚间进食表现"],
            "observationPoints": ["进食意愿", "饮水量"],
            "evidence": ["mock-diet-evidence"],
        },
        "parentCommunicationAgentView": {
            "role": "ParentCommunicationAgent",
            "title": "家园协同",
            "summary": first_non_empty(
                [
                    continuity_notes[1] if len(continuity_notes) > 1 else "",
                    "今晚要把家庭动作说清楚，并留下可回传的观察点。",
                ],
                "今晚要把家庭动作说清楚，并留下可回传的观察点。",
            ),
            "signals": unique_texts(auto_context["parentFeedbackNotes"][:2] + prompt_context["recent_continuity_signals"][:1], limit=3),
            "actions": unique_texts(["发送简洁家长话术", "约定明早反馈窗口", *prompt_context["open_loops"][:1]], limit=3),
            "observationPoints": ["家长执行情况", "孩子家庭侧表现"],
            "evidence": ["mock-parent-evidence"],
        },
        "inSchoolActionAgentView": {
            "role": "InSchoolActionAgent",
            "title": "园内执行",
            "summary": "今天先完成园内最关键的一条可执行动作。",
            "signals": auto_context["classSignals"][:2],
            "actions": ["补齐记录", "同步班级老师"],
            "observationPoints": ["是否已留档", "是否已同步"],
            "evidence": ["mock-execution-evidence"],
        },
        "todayInSchoolActions": unique_texts(["今天先补齐园内观察记录。", "必要时同步班级老师二次确认。", *prompt_context["open_loops"][:1]], limit=3),
        "tonightAtHomeActions": unique_texts(
            ["今晚记录孩子的情绪、进食和入睡表现。", "如有异常变化，立刻补充备注。", *prompt_context["last_consultation_takeaways"][:1]],
            limit=3,
        ),
        "followUp48h": [review_in_48h],
        "parentMessageDraft": first_non_empty(
            [
                continuity_notes[2] if len(continuity_notes) > 2 else "",
                f"今晚请重点观察 {child_name} 的情绪、进食和入睡表现，并在明早反馈给老师。",
            ],
            f"今晚请重点观察 {child_name} 的情绪、进食和入睡表现，并在明早反馈给老师。",
        ),
        "directorDecisionCard": {
            "title": "园长决策卡",
            "reason": first_non_empty(
                [
                    prompt_context["open_loops"][0] if prompt_context["open_loops"] else "",
                    "当前属于高风险闭环优先级，建议教师先执行，必要时再升级机构派单。",
                ],
                "当前属于高风险闭环优先级，建议教师先执行，必要时再升级机构派单。",
            ),
            "recommendedOwnerRole": "teacher",
            "recommendedOwnerName": "班级老师",
            "recommendedAt": "today",
            "status": "pending",
        },
        "explainability": [
            {"label": "触发原因", "detail": "教师主动发起会诊，系统补充自动上下文。"},
            {"label": "闭环策略", "detail": "先做当天动作，再保留 48 小时复查点。"},
            *[
                {"label": "连续性参考", "detail": note}
                for note in continuity_notes[:2]
            ],
        ],
        "nextCheckpoints": unique_texts(["今晚形成家庭反馈", "明早核对园内与家庭观察", review_in_48h, *prompt_context["open_loops"][:1]], limit=4),
        "coordinatorSummary": {
            "finalConclusion": "高风险闭环已启动",
            "riskLevel": "high",
            "problemDefinition": first_non_empty(
                [
                    prompt_context["last_consultation_takeaways"][0] if prompt_context["last_consultation_takeaways"] else "",
                    "需要把园内观察、家庭反馈和 48 小时复查串成同一条链路。",
                ],
                "需要把园内观察、家庭反馈和 48 小时复查串成同一条链路。",
            ),
            "schoolAction": "今天先补齐园内观察记录。",
            "homeAction": "今晚形成一条明确的家庭反馈。",
            "observationPoints": observation_points,
            "reviewIn48h": review_in_48h,
            "shouldEscalateToAdmin": True,
        },
        "schoolAction": "今天先补齐园内观察记录。",
        "homeAction": "今晚形成一条明确的家庭反馈。",
        "observationPoints": observation_points,
        "reviewIn48h": review_in_48h,
        "shouldEscalateToAdmin": True,
        "source": "mock",
        "model": "mock-high-risk-v1",
        "generatedAt": generated_at,
    }

    result = {
        **consultation,
        "interventionCard": _build_intervention_card(
            child_id=child_id,
            child_name=child_name,
            summary=summary,
            risk_level="high",
            tonight_home_action="今晚优先记录孩子的情绪、进食和入睡表现。",
            observation_points=observation_points,
            review_in_48h=review_in_48h,
            consultation_id=consultation_id,
        ),
        "autoContext": auto_context,
        "providerTrace": {
            "llm": "mock-llm",
            "ocr": "mock-ocr",
            "asr": "mock-asr",
            "tts": "mock-tts",
            "modes": {
                "llm": "mock",
                "ocr": "mock",
                "asr": "mock",
                "tts": "mock",
            },
        },
        "audioNarrationScript": summary,
        "multimodalNotes": {
            "imageText": safe_dict(payload.get("imageInput")).get("content"),
            "voiceText": safe_dict(payload.get("voiceInput")).get("content"),
            "teacherNote": payload.get("teacherNote"),
        },
    }
    return _attach_memory_fields(payload, result, child_name)


def build_mock_vision_meal(_: dict[str, Any]) -> ProviderResult[list[dict[str, str]]]:
    return ProviderResult(
        provider="mock-vision",
        mode="mock",
        output=[
            {"name": "米饭", "category": "主食", "amount": "1 bowl"},
            {"name": "青菜", "category": "蔬果", "amount": "60g"},
            {"name": "鸡肉", "category": "蛋白", "amount": "70g"},
        ],
        model="mock-vision-meal-v1",
    )


def build_mock_diet_evaluation(payload: dict[str, Any]) -> dict[str, Any]:
    meal_foods = safe_list(safe_dict(payload.get("input")).get("mealFoods"))
    score = 80 if meal_foods else 64
    return {
        "evaluation": {
            "mealScore": score,
            "mealComment": "当前餐次结构基本完整，可继续保持主食、蛋白、蔬果搭配。",
            "todayScore": max(score - 2, 60),
            "todayComment": "今天整体饮食表现稳定，建议继续补充饮水记录。",
            "recentScore": max(score - 4, 58),
            "recentComment": "近几天饮食趋势较稳定，可继续观察蔬菜和饮水覆盖。",
            "suggestions": [
                "继续保持主食、蛋白、蔬果的搭配。",
                "把饮水分布到上午和下午。",
                "如果连续两餐蔬果不足，可在加餐补充。",
            ],
        },
        "source": "mock",
        "model": "mock-diet-evaluation-v1",
    }
