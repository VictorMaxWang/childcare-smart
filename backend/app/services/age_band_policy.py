from __future__ import annotations

import json
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any


POLICY_PATH = Path(__file__).resolve().parents[3] / "shared" / "age-band-care-policy.json"
AGE_BAND_LABELS = {
    "0-12m": "0-12月",
    "12-24m": "12-24月",
    "24-36m": "24-36月",
}


def _normalize_token(value: str) -> str:
    return value.strip().lower().replace("—", "-").replace("–", "-").replace(" ", "")


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value or "").strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None


def _months_between(birth_date: date, as_of_date: date) -> int:
    months = (as_of_date.year - birth_date.year) * 12 + (as_of_date.month - birth_date.month)
    if as_of_date.day < birth_date.day:
        months -= 1
    return months


def _resolve_age_band_from_birth_date(
    birth_date: str | None,
    as_of_date: Any = None,
) -> tuple[int, str | None] | None:
    parsed_birth_date = _parse_date(birth_date)
    if parsed_birth_date is None:
        return None

    resolved_as_of_date = _parse_date(as_of_date) or date.today()
    age_months = _months_between(parsed_birth_date, resolved_as_of_date)
    if age_months < 0:
        return None

    normalized_age_band = None
    if age_months < 12:
        normalized_age_band = "0-12m"
    elif age_months < 24:
        normalized_age_band = "12-24m"
    elif age_months < 36:
        normalized_age_band = "24-36m"

    return age_months, normalized_age_band


@lru_cache(maxsize=1)
def _policy_source() -> dict[str, Any]:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def normalize_age_band(raw_age_band: str | None = None) -> str | None:
    normalized = _normalize_token(str(raw_age_band or ""))
    if not normalized:
        return None

    if normalized in {"1-3岁", "1至3岁", "1~3岁"}:
        return None

    if normalized in {
        "0-12m",
        "0-12month",
        "0-12months",
        "0-12月",
        "0-12个月",
        "0-12個月",
        "0-6个月",
        "0-6個月",
        "6-12个月",
        "6-12個月",
    }:
        return "0-12m"

    if normalized in {
        "12-24m",
        "12-24month",
        "12-24months",
        "12-24月",
        "12-24个月",
        "12-24個月",
        "1-2岁",
        "1至2岁",
        "1~2岁",
    }:
        return "12-24m"

    if normalized in {
        "24-36m",
        "24-36month",
        "24-36months",
        "24-36月",
        "24-36个月",
        "24-36個月",
        "2-3岁",
        "2至3岁",
        "2~3岁",
    }:
        return "24-36m"

    return None


def resolve_age_band_context(input_value: dict[str, Any] | None = None) -> dict[str, Any]:
    source = _policy_source()
    input_value = input_value or {}
    raw_age_band = str(input_value.get("ageBand") or input_value.get("age_band") or "").strip() or None
    birth_date = str(input_value.get("birthDate") or input_value.get("birth_date") or "").strip() or None
    birth_resolved = _resolve_age_band_from_birth_date(
        birth_date,
        input_value.get("asOfDate") or input_value.get("as_of_date"),
    )

    if birth_resolved is not None:
        age_months, normalized_age_band = birth_resolved
        return {
            "policyVersion": source.get("policyVersion"),
            "birthDate": birth_date,
            "rawAgeBand": raw_age_band,
            "normalizedAgeBand": normalized_age_band,
            "ageMonths": age_months,
            "source": "birthDate",
            "policy": source.get("policies", {}).get(normalized_age_band) if normalized_age_band else None,
        }

    normalized_age_band = input_value.get("normalizedAgeBand") or input_value.get("normalized_age_band")
    if not normalized_age_band:
        normalized_age_band = normalize_age_band(raw_age_band)

    return {
        "policyVersion": source.get("policyVersion"),
        "birthDate": birth_date,
        "rawAgeBand": raw_age_band,
        "normalizedAgeBand": normalized_age_band,
        "ageMonths": None,
        "source": "ageBand" if raw_age_band else "unknown",
        "policy": source.get("policies", {}).get(normalized_age_band) if normalized_age_band else None,
    }


def resolve_age_band_policy(input_value: Any) -> dict[str, Any] | None:
    if input_value is None:
        return None

    policies = _policy_source().get("policies", {})

    if isinstance(input_value, str):
        normalized_age_band = input_value if input_value in policies else normalize_age_band(input_value)
        return policies.get(normalized_age_band) if normalized_age_band else None

    if isinstance(input_value, dict):
        policy = input_value.get("policy")
        if isinstance(policy, dict):
            return policy

        normalized_age_band = input_value.get("normalizedAgeBand") or input_value.get("normalized_age_band")
        if normalized_age_band in policies:
            return policies.get(normalized_age_band)

        return resolve_age_band_context(input_value).get("policy")

    return None


def get_care_focus_for_age_band(input_value: Any) -> list[str]:
    policy = resolve_age_band_policy(input_value)
    return list(policy.get("careFocus") or []) if policy else []


def get_age_band_label(input_value: Any) -> str | None:
    policy = resolve_age_band_policy(input_value)
    if not policy:
        return None
    return AGE_BAND_LABELS.get(str(policy.get("ageBand") or ""))


normalizeAgeBand = normalize_age_band
resolveAgeBandContext = resolve_age_band_context
resolveAgeBandPolicy = resolve_age_band_policy
getCareFocusForAgeBand = get_care_focus_for_age_band
