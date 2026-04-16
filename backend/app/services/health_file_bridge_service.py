from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings
from app.providers.vivo_ocr import VivoOcrProvider


DISCLAIMER = (
    "T9 bridge returns structured facts plus conservative childcare action suggestions from file metadata and text hints. "
    "It does not perform verified binary OCR, medical diagnosis, medication authorization, clearance decisions, writeback, or escalation dispatch."
)

FILE_TYPE_PRIORITY: tuple[str, ...] = (
    "recheck-slip",
    "checklist",
    "pdf",
    "report-screenshot",
    "unknown",
)

REPORT_KEYWORDS = (
    "report",
    "lab",
    "result",
    "检验",
    "检查",
    "报告",
)
CHECKLIST_KEYWORDS = (
    "checklist",
    "form",
    "sheet",
    "单",
    "表",
)
RECHECK_KEYWORDS = (
    "recheck",
    "follow-up",
    "follow up",
    "复查",
    "复诊",
    "复测",
    "复检",
)
ALLERGY_KEYWORDS = (
    "allergy",
    "allergic",
    "过敏",
)
MEDICATION_KEYWORDS = (
    "medication",
    "medicine",
    "prescription",
    "antibiotic",
    "nebulizer",
    "用药",
    "药",
    "处方",
    "抗生素",
    "雾化",
)
FEVER_KEYWORDS = (
    "fever",
    "temperature",
    "temp",
    "发热",
    "发烧",
    "体温",
)
ABNORMAL_KEYWORDS = (
    "abnormal",
    "positive",
    "elevated",
    "high",
    "low",
    "异常",
    "偏高",
    "偏低",
    "阳性",
)
FOLLOW_UP_HINT_KEYWORDS = (
    *RECHECK_KEYWORDS,
    "review",
    "复查",
    "随访",
    "明天",
    "tomorrow",
    "48h",
    "48小时",
)
TEMPERATURE_PATTERN = re.compile(r"(?<!\d)(3[5-9](?:\.\d)?)(?:\s*(?:°?\s*[cC]|℃))?")
DANGEROUS_ACTION_PATTERNS = {
    "allergy": (
        "allergen exposure is acceptable",
        "resume suspect food",
        "resume shared food",
    ),
    "medication": (
        "administer medicine based on the file",
        "start a medication plan from this file",
    ),
    "clearance": (
        "resume normal activity",
        "treat the file as clearance",
        "cleared for regular activity",
    ),
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_text(value: Any) -> str:
    return (_coerce_string(value) or "").lower()


def _file_value(item: dict[str, Any], camel: str, snake: str) -> Any:
    return item.get(camel) if camel in item else item.get(snake)


def _collect_signals(payload: dict[str, Any], provider_result: dict[str, Any]) -> dict[str, Any]:
    files = payload.get("files") if isinstance(payload.get("files"), list) else []
    file_names = [_coerce_string(_file_value(item, "name", "name")) for item in files if isinstance(item, dict)]
    preview_texts = [
        _coerce_string(_file_value(item, "previewText", "preview_text"))
        for item in files
        if isinstance(item, dict)
    ]
    mime_types = [
        _coerce_string(_file_value(item, "mimeType", "mime_type"))
        for item in files
        if isinstance(item, dict)
    ]
    file_urls = [
        _coerce_string(_file_value(item, "fileUrl", "file_url"))
        for item in files
        if isinstance(item, dict)
    ]
    notes = _coerce_string(payload.get("optionalNotes") or payload.get("optional_notes")) or ""
    provider_text = _coerce_string(provider_result.get("text")) or ""

    haystack = _normalize_text(
        " ".join(
            [
                _coerce_string(payload.get("fileKind") or payload.get("file_kind")) or "",
                *[item for item in file_names if item],
                *[item for item in mime_types if item],
                *[item for item in preview_texts if item],
                *[item for item in file_urls if item],
                notes,
                provider_text,
            ]
        )
    )

    return {
        "files": files,
        "file_names": [item for item in file_names if item],
        "preview_texts": [item for item in preview_texts if item],
        "mime_types": [item for item in mime_types if item],
        "file_urls": [item for item in file_urls if item],
        "notes": notes,
        "provider_text": provider_text,
        "haystack": haystack,
    }


def _has_keyword(haystack: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword.lower() in haystack for keyword in keywords)


def _detect_file_type(payload: dict[str, Any], signals: dict[str, Any]) -> str:
    explicit_kind = _normalize_text(payload.get("fileKind") or payload.get("file_kind"))
    haystack = signals["haystack"]
    files = signals["files"]
    types: set[str] = set()

    for item in files:
        if not isinstance(item, dict):
            continue
        mime_type = _normalize_text(_file_value(item, "mimeType", "mime_type"))
        name = _normalize_text(_file_value(item, "name", "name"))
        if "pdf" in mime_type or name.endswith(".pdf"):
            types.add("pdf")
        elif mime_type.startswith("image/"):
            types.add("report-screenshot")

    if explicit_kind in {"lab-report", "health-note"} or _has_keyword(haystack, REPORT_KEYWORDS):
        types.add("report-screenshot" if "report-screenshot" in types else "pdf" if "pdf" in types else "report-screenshot")
    if explicit_kind in {"discharge-note"} or _has_keyword(haystack, RECHECK_KEYWORDS):
        types.add("recheck-slip")
    if explicit_kind in {"prescription"} or _has_keyword(haystack, CHECKLIST_KEYWORDS):
        types.add("checklist")

    types.discard("unknown")
    if not types:
        return "unknown"
    if len(types) == 1:
        return next(iter(types))
    ordered = [item for item in FILE_TYPE_PRIORITY if item in types]
    return ordered[0] if len(ordered) == 1 else "mixed"


def _extract_temperature_text(haystack: str) -> str | None:
    match = TEMPERATURE_PATTERN.search(haystack)
    if not match:
        return None
    return match.group(1)


def _base_facts(payload: dict[str, Any], signals: dict[str, Any], file_type: str) -> list[dict[str, str]]:
    file_count = len(payload.get("files") or [])
    source_role = payload.get("sourceRole") or payload.get("source_role")
    facts = [
        {
            "label": "File type",
            "detail": f"Detected fileType={file_type} from the uploaded file metadata and text hints.",
            "source": "derived:file-type",
        },
        {
            "label": "Source role",
            "detail": f"Current request came from {source_role}.",
            "source": "request-meta",
        },
        {
            "label": "Extraction mode",
            "detail": (
                f"T8 processed {file_count} file(s) using request-supplied preview text, notes, file names, and mime hints only."
            ),
            "source": "request-meta",
        },
    ]
    if signals["provider_text"]:
        facts.append(
            {
                "label": "Text evidence",
                "detail": "A text hint was available for structured extraction.",
                "source": "ocr:text-fallback",
            }
        )
    return facts


def _signal_facts(haystack: str) -> list[dict[str, str]]:
    facts: list[dict[str, str]] = []
    temperature = _extract_temperature_text(haystack)
    if temperature:
        facts.append(
            {
                "label": "Temperature mention",
                "detail": f"Detected a temperature-like value: {temperature}.",
                "source": "pattern:temperature",
            }
        )
    if _has_keyword(haystack, ALLERGY_KEYWORDS):
        facts.append(
            {
                "label": "Allergy mention",
                "detail": "Detected allergy-related wording in the provided text hints.",
                "source": "pattern:allergy",
            }
        )
    if _has_keyword(haystack, MEDICATION_KEYWORDS):
        facts.append(
            {
                "label": "Medication mention",
                "detail": "Detected medication or prescription-related wording in the provided text hints.",
                "source": "pattern:medication",
            }
        )
    if _has_keyword(haystack, ABNORMAL_KEYWORDS):
        facts.append(
            {
                "label": "Abnormal result wording",
                "detail": "Detected wording that usually appears around abnormal or flagged findings.",
                "source": "pattern:abnormal",
            }
        )
    if _has_keyword(haystack, FOLLOW_UP_HINT_KEYWORDS):
        facts.append(
            {
                "label": "Follow-up wording",
                "detail": "Detected recheck, review, or follow-up wording in the available text hints.",
                "source": "pattern:follow-up",
            }
        )
    return facts


def _risk_items(haystack: str) -> list[dict[str, str]]:
    risks: list[dict[str, str]] = []
    temperature = _extract_temperature_text(haystack)
    if temperature:
        severity = "high" if float(temperature) >= 38 else "medium"
        risks.append(
            {
                "title": "Temperature-related signal needs manual confirmation",
                "severity": severity,
                "detail": "A temperature mention was detected in the uploaded material. Staff should verify the original document and the child's current status before operational use.",
                "source": "pattern:temperature",
            }
        )
    if _has_keyword(haystack, ALLERGY_KEYWORDS):
        risks.append(
            {
                "title": "Potential allergy-related instruction detected",
                "severity": "high",
                "detail": "Allergy wording was detected, but the exact allergen and scope were not independently verified from binary OCR.",
                "source": "pattern:allergy",
            }
        )
    if _has_keyword(haystack, MEDICATION_KEYWORDS):
        risks.append(
            {
                "title": "Medication wording should not be treated as verified administration guidance",
                "severity": "medium",
                "detail": "Prescription or medication wording was detected, but T8 only extracts structure and does not verify dosage, authorization, or daycare execution rules.",
                "source": "pattern:medication",
            }
        )
    if _has_keyword(haystack, ABNORMAL_KEYWORDS):
        risks.append(
            {
                "title": "Abnormal or flagged result wording detected",
                "severity": "medium",
                "detail": "The text hints contain abnormal-result wording that may require review against the original document.",
                "source": "pattern:abnormal",
            }
        )
    if not risks:
        risks.append(
            {
                "title": "Low-confidence extraction from limited text hints",
                "severity": "low",
                "detail": "The current request does not include enough verified text to infer more specific medical facts safely.",
                "source": "fallback:text-hints",
            }
        )
    return risks


def _contraindications(haystack: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    if _has_keyword(haystack, ALLERGY_KEYWORDS):
        items.append(
            {
                "title": "Do not assume allergen exposure is acceptable",
                "detail": "Allergy-related wording was detected, so meals, activity materials, or medication exposure should not be inferred as safe from this file alone.",
                "source": "pattern:allergy",
            }
        )
    if _has_keyword(haystack, MEDICATION_KEYWORDS):
        items.append(
            {
                "title": "Do not infer a daycare medication plan from the file alone",
                "detail": "Medication wording was detected, but dosage and administration authority were not verified by binary OCR or writeback flows.",
                "source": "pattern:medication",
            }
        )
    temperature = _extract_temperature_text(haystack)
    if temperature and float(temperature) >= 38:
        items.append(
            {
                "title": "Avoid treating the file as a diagnosis clearance",
                "detail": "A fever-range value was detected. The upload should not be used as proof that normal activity is already cleared.",
                "source": "pattern:temperature",
            }
        )
    return items


def _follow_up_hints(haystack: str, file_type: str) -> list[dict[str, str]]:
    hints: list[dict[str, str]] = []
    if file_type == "recheck-slip" or _has_keyword(haystack, FOLLOW_UP_HINT_KEYWORDS):
        hints.append(
            {
                "title": "Keep the original follow-up timing visible",
                "detail": "The upload appears to contain recheck or follow-up wording. Preserve the original timeline from the source document for later T9/T10 mapping.",
                "source": "pattern:follow-up",
            }
        )
    if _has_keyword(haystack, MEDICATION_KEYWORDS):
        hints.append(
            {
                "title": "Capture the exact medication wording for later review",
                "detail": "If this file is reused downstream, keep the original medication phrasing rather than paraphrasing it into an action prematurely.",
                "source": "pattern:medication",
            }
        )
    if not hints:
        hints.append(
            {
                "title": "Preserve the original file for manual walkthrough",
                "detail": "T8 extracted only structured hints. A later walkthrough should compare these hints against the original screenshot or PDF before mapping actions.",
                "source": "fallback:text-hints",
            }
        )
    return hints


def _dedupe(items: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        value = _coerce_string(item.get(key))
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(item)
    return result


def _unique_strings(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = _coerce_string(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _build_action_item(
    title: str,
    detail: str,
    source: str,
    based_on: list[Any],
) -> dict[str, Any]:
    return {
        "title": title,
        "detail": detail,
        "source": source,
        "basedOn": _unique_strings(based_on),
    }


def _has_fact_label(facts: list[dict[str, Any]], label: str) -> bool:
    return any(_coerce_string(item.get("label")) == label for item in facts)


def _has_risk_title(risks: list[dict[str, Any]], pattern: str) -> bool:
    target = pattern.lower()
    return any(target in (_coerce_string(item.get("title")) or "").lower() for item in risks)


def _has_contraindication_text(items: list[dict[str, Any]], pattern: str) -> bool:
    target = pattern.lower()
    return any(
        target in f"{_coerce_string(item.get('title')) or ''} {_coerce_string(item.get('detail')) or ''}".lower()
        for item in items
    )


def _has_follow_up_title(items: list[dict[str, Any]], pattern: str) -> bool:
    target = pattern.lower()
    return any(target in (_coerce_string(item.get("title")) or "").lower() for item in items)


def _filter_unsafe_action_items(
    items: list[dict[str, Any]],
    contraindications: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    has_allergy_contra = _has_contraindication_text(contraindications, "allergy")
    has_medication_contra = _has_contraindication_text(contraindications, "medication")
    has_clearance_contra = _has_contraindication_text(
        contraindications, "clearance"
    ) or _has_contraindication_text(contraindications, "normal activity")

    result: list[dict[str, Any]] = []
    for item in items:
        text = f"{_coerce_string(item.get('title')) or ''} {_coerce_string(item.get('detail')) or ''}".lower()
        if has_allergy_contra and any(
            pattern in text for pattern in DANGEROUS_ACTION_PATTERNS["allergy"]
        ):
            continue
        if has_medication_contra and any(
            pattern in text for pattern in DANGEROUS_ACTION_PATTERNS["medication"]
        ):
            continue
        if has_clearance_contra and any(
            pattern in text for pattern in DANGEROUS_ACTION_PATTERNS["clearance"]
        ):
            continue
        result.append(item)
    return result


def _build_action_mapping(
    *,
    file_type: str,
    extracted_facts: list[dict[str, Any]],
    risk_items: list[dict[str, Any]],
    contraindications: list[dict[str, Any]],
    follow_up_hints: list[dict[str, Any]],
    confidence: float,
) -> dict[str, Any]:
    school_today_actions: list[dict[str, Any]] = []
    family_tonight_actions: list[dict[str, Any]] = []
    follow_up_plan: list[dict[str, Any]] = []

    has_temperature = _has_fact_label(extracted_facts, "Temperature mention")
    has_allergy = _has_fact_label(extracted_facts, "Allergy mention")
    has_medication = _has_fact_label(extracted_facts, "Medication mention")
    has_follow_up = (
        file_type == "recheck-slip"
        or _has_fact_label(extracted_facts, "Follow-up wording")
        or _has_follow_up_title(follow_up_hints, "follow-up")
        or _has_follow_up_title(follow_up_hints, "timing")
    )
    has_abnormal = _has_fact_label(extracted_facts, "Abnormal result wording")
    has_high_risk = any(item.get("severity") == "high" for item in risk_items)
    has_medium_risk = any(item.get("severity") == "medium" for item in risk_items)
    low_confidence = (
        confidence < 0.45
        or _has_risk_title(risk_items, "low-confidence extraction")
        or not any((has_temperature, has_allergy, has_medication, has_follow_up, has_abnormal))
    )

    if low_confidence:
        school_today_actions.append(
            _build_action_item(
                "Verify the original file and log today's observation window",
                "Before using the upload operationally, compare it with the original file and log today's temperature, energy, eating, and comfort observations.",
                "rule:low-confidence-review",
                ["Low-confidence extraction from limited text hints", "File type", "Extraction mode"],
            )
        )
        family_tonight_actions.append(
            _build_action_item(
                "Send a clearer file or wording tonight and share the child's current status",
                "Ask the family to resend the clearest available file or wording tonight and add a short update on temperature, energy, sleep, and appetite.",
                "rule:low-confidence-review",
                ["Low-confidence extraction from limited text hints", "Preserve the original file for manual walkthrough"],
            )
        )

    if has_temperature:
        school_today_actions.append(
            _build_action_item(
                "Recheck today and keep activity calm",
                "Recheck the child's temperature and comfort today, reduce strenuous activity, offer fluids, and keep an observation note for the next handoff.",
                "rule:temperature",
                ["Temperature mention", "Temperature-related signal needs manual confirmation"],
            )
        )
        family_tonight_actions.append(
            _build_action_item(
                "Watch temperature, energy, and sleep tonight",
                "Ask the family to watch temperature, energy, breathing comfort, sleep, and appetite tonight and send an update before the next attendance.",
                "rule:temperature",
                ["Temperature mention", "Temperature-related signal needs manual confirmation"],
            )
        )
        follow_up_plan.append(
            _build_action_item(
                "Confirm the latest temperature before next arrival",
                "Keep the next check-in anchored to the most recent temperature and whether the child settled overnight.",
                "rule:temperature-follow-up",
                ["Temperature mention", "Temperature-related signal needs manual confirmation"],
            )
        )

    if has_allergy:
        school_today_actions.append(
            _build_action_item(
                "Temporarily avoid unverified allergen exposure today",
                "Until the original allergen wording is confirmed, avoid introducing suspect foods, materials, or other trigger exposure in school.",
                "rule:allergy",
                ["Allergy mention", "Potential allergy-related instruction detected", "Do not assume allergen exposure is acceptable"],
            )
        )
        family_tonight_actions.append(
            _build_action_item(
                "Confirm the exact allergen wording with the family",
                "Ask the family to send the exact allergen, trigger, and source wording from the original file tonight.",
                "rule:allergy",
                ["Allergy mention", "Potential allergy-related instruction detected"],
            )
        )

    if has_medication:
        school_today_actions.append(
            _build_action_item(
                "Do not administer medicine from the file alone",
                "Do not turn the upload into a school medication plan until written authorization and the exact original wording are confirmed.",
                "rule:medication",
                ["Medication mention", "Medication wording should not be treated as verified administration guidance", "Do not infer a daycare medication plan from the file alone"],
            )
        )
        family_tonight_actions.append(
            _build_action_item(
                "If school coordination is needed, provide authorization and label wording",
                "Ask the family to provide the written authorization path and the original label or prescription wording before any next-day school coordination.",
                "rule:medication",
                ["Medication mention", "Medication wording should not be treated as verified administration guidance"],
            )
        )

    if has_follow_up:
        follow_up_plan.append(
            _build_action_item(
                "Keep the original follow-up timing visible",
                "Carry forward the follow-up or recheck timing exactly as written and use it as the next observation deadline.",
                "rule:follow-up",
                ["Follow-up wording", "Keep the original follow-up timing visible"],
            )
        )

    if not follow_up_plan:
        follow_up_plan.append(
            _build_action_item(
                "Do a manual review before tomorrow check-in",
                "Before the next arrival, confirm the original file wording and whether any new symptoms or follow-up instructions appeared overnight.",
                "rule:next-day-review",
                ["Preserve the original file for manual walkthrough", "Extraction mode"],
            )
        )

    filtered_school_actions = _filter_unsafe_action_items(
        _dedupe(school_today_actions, "title"),
        contraindications,
    )
    filtered_family_actions = _filter_unsafe_action_items(
        _dedupe(family_tonight_actions, "title"),
        contraindications,
    )
    filtered_follow_up = _filter_unsafe_action_items(
        _dedupe(follow_up_plan, "title"),
        contraindications,
    )

    school_actions = filtered_school_actions or [
        _build_action_item(
            "Verify the original file and keep today's observation brief",
            "Use the file only as a prompt to verify the original wording and keep a brief observation note today.",
            "rule:fallback-review",
            ["File type", "Extraction mode"],
        )
    ]
    family_actions = filtered_family_actions or [
        _build_action_item(
            "Share a factual status update tonight",
            "Ask the family for a factual update tonight so tomorrow's school handoff does not depend on guesswork.",
            "rule:fallback-review",
            ["Extraction mode"],
        )
    ]
    review_actions = filtered_follow_up or [
        _build_action_item(
            "Keep the next check-in manual",
            "Before the next attendance, manually confirm the file wording and any change in the child's status.",
            "rule:fallback-review",
            ["Extraction mode"],
        )
    ]

    escalation_suggestion = {
        "shouldUpgradeAttention": False,
        "level": "routine",
        "reason": "Current extraction supports conservative observation and document verification without triggering a same-day escalation flow.",
    }
    if has_high_risk:
        escalation_suggestion = {
            "shouldUpgradeAttention": True,
            "level": "same-day-review",
            "reason": "A high-risk extraction signal needs same-day teacher-family review before normal routine decisions are treated as safe.",
        }
    elif has_medication or has_allergy or (has_follow_up and (has_medium_risk or has_high_risk)) or has_medium_risk:
        escalation_suggestion = {
            "shouldUpgradeAttention": True,
            "level": "heightened",
            "reason": "The file contains medium-risk or coordination-sensitive signals that need tighter observation and a clearer handoff.",
        }

    teacher_draft_hint = (
        f"Teacher handoff hint: {(school_actions[0].get('title') or 'Verify the original file')} "
        f"Follow {(review_actions[0].get('title') or 'keep the next check-in manual')}, "
        "keep the wording operational, and avoid diagnosis or medication promises."
    )
    parent_communication_draft_hint = (
        f"Parent communication hint: {(family_actions[0].get('title') or 'Share a factual status update tonight')} "
        f"Please keep the update factual and support {str(review_actions[0].get('title') or 'the next manual check-in').lower()}."
    )

    return {
        "schoolTodayActions": school_actions,
        "familyTonightActions": family_actions,
        "followUpPlan": review_actions,
        "escalationSuggestion": escalation_suggestion,
        "teacherDraftHint": teacher_draft_hint,
        "parentCommunicationDraftHint": parent_communication_draft_hint,
    }


def _confidence(signals: dict[str, Any], facts: list[dict[str, Any]], file_type: str) -> float:
    score = 0.18
    if signals["preview_texts"]:
        score += 0.34
    if signals["notes"]:
        score += 0.14
    if signals["file_urls"]:
        score += 0.08
    if file_type != "unknown":
        score += 0.12
    score += min(len(facts), 5) * 0.04
    if not signals["provider_text"]:
        score -= 0.06
    return round(max(0.1, min(score, 0.92)), 2)


async def run_health_file_bridge(payload: dict[str, Any]) -> dict[str, Any]:
    files = payload.get("files")
    if not isinstance(files, list) or len(files) == 0:
        raise ValueError("files must include at least one file item")

    source_role = _coerce_string(payload.get("sourceRole") or payload.get("source_role"))
    if source_role not in {"parent", "teacher"}:
        raise ValueError("sourceRole must be 'parent' or 'teacher'")

    request_source = _coerce_string(payload.get("requestSource") or payload.get("request_source"))
    if not request_source:
        raise ValueError("requestSource cannot be empty")

    provider = VivoOcrProvider(get_settings())
    provider_result = provider.extract(
        files=files,
        optional_notes=_coerce_string(payload.get("optionalNotes") or payload.get("optional_notes")),
    )
    signals = _collect_signals(payload, provider_result)
    file_type = _detect_file_type(payload, signals)
    facts = _dedupe(
        [*_base_facts(payload, signals, file_type), *_signal_facts(signals["haystack"])],
        "label",
    )
    risks = _dedupe(_risk_items(signals["haystack"]), "title")
    contraindications = _dedupe(_contraindications(signals["haystack"]), "title")
    follow_up_hints = _dedupe(_follow_up_hints(signals["haystack"], file_type), "title")
    confidence = _confidence(signals, facts, file_type)
    action_mapping = _build_action_mapping(
        file_type=file_type,
        extracted_facts=facts,
        risk_items=risks,
        contraindications=contraindications,
        follow_up_hints=follow_up_hints,
        confidence=confidence,
    )

    return {
        "childId": payload.get("childId") or payload.get("child_id"),
        "sourceRole": source_role,
        "fileKind": payload.get("fileKind") or payload.get("file_kind"),
        "fileType": file_type,
        "summary": "T9 mapped extracted health-file hints into conservative childcare actions. Medical diagnosis, medication authorization, and writeback remain out of scope.",
        "extractedFacts": facts,
        "riskItems": risks,
        "contraindications": contraindications,
        "followUpHints": follow_up_hints,
        "actionMapping": action_mapping,
        "confidence": confidence,
        "disclaimer": DISCLAIMER,
        "source": "backend-text-fallback",
        "fallback": True,
        "mock": True,
        "liveReadyButNotVerified": bool(provider_result.get("liveReadyButNotVerified")),
        "generatedAt": _iso_now(),
        "provider": str(provider_result.get("provider") or provider.provider_name),
        "model": str(provider_result.get("model") or provider.model_name),
    }
