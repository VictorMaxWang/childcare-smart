from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from typing import Any


DEMO_TZ = timezone(timedelta(hours=8))
INSTITUTION_ID = "inst-demo"
INSTITUTION_NAME = "智慧托育示范园"
DEFAULT_PERIOD_LABEL = "本周"
DEFAULT_PRIORITY_CHILD_ID = "c-15"
DEFAULT_HIGH_RISK_CHILD_ID = "c-8"
DEFAULT_HYDRATION_CHILD_ID = "c-15"
DEMO_POSITIVE_CHILD_ID = "c-3"
DEMO_HERO_CHILD_IDS = ("c-1", "c-8", "c-11", "c-14", "c-15")

ATTENDANCE_DAYS = (0, 1, 2, 3)
TODAY_ABSENT_CHILD_NUMBERS = {4, 7, 11, 19, 24, 25, 30, 33}
TODAY_LATE_CHILD_NUMBERS = {2, 6, 12, 28}
DEFAULT_SNAPSHOT_KEYS = (
    "children",
    "attendance",
    "meals",
    "growth",
    "feedback",
    "health",
    "taskCheckIns",
    "interventionCards",
    "consultations",
    "mobileDrafts",
    "reminders",
    "tasks",
)

CHILD_SEEDS: list[dict[str, Any]] = [
    {"id": "c-1", "name": "林小雨", "nickname": "小雨", "birthDate": "2023-08-12", "gender": "female", "allergies": ["牛奶", "芒果"], "className": "向阳班"},
    {"id": "c-2", "name": "张浩然", "nickname": "浩浩", "birthDate": "2022-05-09", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-3", "name": "陈思琪", "nickname": "琪琪", "birthDate": "2020-11-19", "gender": "female", "allergies": ["芒果"], "className": "晨曦班"},
    {"id": "c-4", "name": "王小明", "nickname": "明明", "birthDate": "2024-06-03", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-5", "name": "赵安安", "nickname": "安安", "birthDate": "2019-10-01", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-6", "name": "刘子轩", "nickname": "轩轩", "birthDate": "2023-01-20", "gender": "male", "allergies": ["鸡蛋"], "className": "向阳班"},
    {"id": "c-7", "name": "杨梓涵", "nickname": "涵涵", "birthDate": "2022-09-15", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-8", "name": "黄嘉豪", "nickname": "豪豪", "birthDate": "2023-11-08", "gender": "male", "allergies": ["花生"], "className": "向阳班"},
    {"id": "c-9", "name": "吴悦彤", "nickname": "彤彤", "birthDate": "2021-03-22", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-10", "name": "孙宇航", "nickname": "航航", "birthDate": "2021-07-30", "gender": "male", "allergies": ["海鲜"], "className": "晨曦班"},
    {"id": "c-11", "name": "周诗雨", "nickname": "诗诗", "birthDate": "2022-12-05", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-12", "name": "徐铭泽", "nickname": "铭铭", "birthDate": "2024-02-14", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-13", "name": "何欣怡", "nickname": "欣欣", "birthDate": "2020-06-18", "gender": "female", "allergies": ["牛奶"], "className": "晨曦班"},
    {"id": "c-14", "name": "郑浩宇", "nickname": "浩宇", "birthDate": "2021-11-25", "gender": "male", "allergies": [], "className": "晨曦班"},
    {"id": "c-15", "name": "马若曦", "nickname": "曦曦", "birthDate": "2023-04-09", "gender": "female", "allergies": ["虾"], "className": "向阳班"},
    {"id": "c-16", "name": "高子墨", "nickname": "墨墨", "birthDate": "2022-02-28", "gender": "male", "allergies": [], "className": "晨曦班"},
    {"id": "c-17", "name": "陈子昂", "nickname": "子昂", "birthDate": "2022-01-17", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-18", "name": "李沐宸", "nickname": "沐宸", "birthDate": "2022-02-18", "gender": "male", "allergies": [], "className": "晨曦班"},
    {"id": "c-19", "name": "张依诺", "nickname": "依诺", "birthDate": "2022-03-19", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-20", "name": "王梓瑜", "nickname": "梓瑜", "birthDate": "2022-04-20", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-21", "name": "刘佳怡", "nickname": "佳怡", "birthDate": "2022-05-11", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-22", "name": "赵梓轩", "nickname": "梓轩", "birthDate": "2022-06-12", "gender": "male", "allergies": [], "className": "晨曦班"},
    {"id": "c-23", "name": "黄语桐", "nickname": "语桐", "birthDate": "2022-07-13", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-24", "name": "周浩轩", "nickname": "浩轩", "birthDate": "2022-08-14", "gender": "male", "allergies": [], "className": "晨曦班"},
    {"id": "c-25", "name": "吴雨桐", "nickname": "雨桐", "birthDate": "2022-09-15", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-26", "name": "孙可馨", "nickname": "可馨", "birthDate": "2022-10-16", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-27", "name": "徐皓轩", "nickname": "皓轩", "birthDate": "2022-11-17", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-28", "name": "马伊诺", "nickname": "伊诺", "birthDate": "2022-12-18", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-29", "name": "朱俊熙", "nickname": "俊熙", "birthDate": "2022-01-19", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-30", "name": "胡子萱", "nickname": "子萱", "birthDate": "2022-02-20", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-31", "name": "郭梓睿", "nickname": "梓睿", "birthDate": "2022-03-21", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-32", "name": "何瑞瑜", "nickname": "瑞瑜", "birthDate": "2022-04-22", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-33", "name": "高梦琪", "nickname": "梦琪", "birthDate": "2022-05-23", "gender": "female", "allergies": [], "className": "向阳班"},
    {"id": "c-34", "name": "林子涵", "nickname": "子涵", "birthDate": "2022-06-24", "gender": "female", "allergies": [], "className": "晨曦班"},
    {"id": "c-35", "name": "郑宇辰", "nickname": "宇辰", "birthDate": "2022-07-25", "gender": "male", "allergies": [], "className": "向阳班"},
    {"id": "c-36", "name": "梁奕辰", "nickname": "奕辰", "birthDate": "2022-08-26", "gender": "male", "allergies": [], "className": "晨曦班"},
]

SCENARIO_BY_CHILD = {
    "c-1": "positive-emotion",
    "c-2": "positive-motor",
    "c-3": "positive-language",
    "c-4": "transition-watch",
    "c-5": "positive-selfcare",
    "c-6": "allergy-watch",
    "c-7": "positive-motor",
    "c-8": "separation-sleep",
    "c-9": "positive-fine-motor",
    "c-10": "impulse-watch",
    "c-11": "picky-eating",
    "c-12": "language-review",
    "c-13": "positive-social",
    "c-14": "sleep-review",
    "c-15": "hydration-risk",
    "c-16": "sensitive-high-risk",
    "c-17": "mild-health",
    "c-18": "stable",
    "c-19": "family-gap",
    "c-20": "growth-review",
    "c-21": "picky-lite",
    "c-22": "stable",
    "c-23": "positive-social",
    "c-24": "review-lite",
    "c-25": "family-gap",
    "c-26": "positive-selfcare",
    "c-27": "mild-health",
    "c-28": "hydration-lite",
    "c-29": "positive-motor",
    "c-30": "stable",
    "c-31": "growth-review",
    "c-32": "positive-language",
    "c-33": "stable",
    "c-34": "stable",
    "c-35": "mild-health",
    "c-36": "positive-social",
}

HEALTH_ABNORMAL_IDS = {"c-6", "c-15", "c-16", "c-17", "c-27", "c-35"}
PICKY_OR_HYDRATION_IDS = {"c-11", "c-15", "c-21", "c-24", "c-28"}
GROWTH_ATTENTION_IDS = {"c-4", "c-8", "c-10", "c-12", "c-14", "c-16", "c-20", "c-31"}
PENDING_REVIEW_IDS = {"c-8", "c-12", "c-14", "c-20", "c-24"}
FEEDBACK_GAP_IDS = {"c-4", "c-8", "c-14", "c-16", "c-19", "c-24", "c-25", "c-31", "c-35"}
ESCALATION_CANDIDATE_IDS = {"c-8", "c-11", "c-14", "c-15"}
HIGHLIGHT_IDS = {"c-1", "c-2", "c-3", "c-5", "c-7", "c-13", "c-23", "c-29"}
NO_FEEDBACK_IDS = {"c-4", "c-19", "c-24", "c-25", "c-27", "c-30", "c-31", "c-35"}

DEMO_MEAL_PHOTO_LIBRARY = {
    "breakfast": ["/demo-meals/breakfast-porridge-real.svg", "/demo-meals/breakfast-sandwich-real.svg"],
    "lunch": ["/demo-meals/lunch-bento-a-real.svg", "/demo-meals/lunch-bento-b-real.svg", "/demo-meals/lunch-bento-c-real.svg"],
    "dinner": ["/demo-meals/dinner-soup-real.svg", "/demo-meals/lunch-bento-b-real.svg"],
    "snack": ["/demo-meals/snack-fruit-yogurt-real.svg", "/demo-meals/snack-corn-milk-real.svg"],
}

DEMO_GROWTH_MEDIA_LIBRARY = [
    "/demo-growth/growth-reading-corner.svg",
    "/demo-growth/growth-garden-balance.svg",
    "/demo-growth/growth-art-table.svg",
    "/demo-growth/growth-sensory-play.svg",
]

SPECIAL_NOTES_BY_FOCUS = {
    "positive-emotion": "情绪恢复稳定，适合作为家长侧正向亮点。",
    "positive-motor": "大动作与专注表现稳定，适合作为录屏亮点。",
    "positive-language": "语言表达清晰，适合周报中的正向案例。",
    "positive-selfcare": "自理能力强，适合正向展示。",
    "positive-fine-motor": "精细动作发展稳定，适合家长侧正向展示。",
    "positive-social": "社交与分享表现突出，适合作为微绘本亮点。",
    "transition-watch": "入园过渡仍需陪伴，建议继续温和跟进。",
    "allergy-watch": "需继续避开过敏食物并观察皮肤反应。",
    "separation-sleep": "午睡前需要稳定过渡，适合作为会诊演示样本。",
    "impulse-watch": "等待与轮流时易着急，需要持续引导。",
    "picky-eating": "偏好熟悉食物，需要鼓励尝试蔬菜。",
    "language-review": "语言观察建议继续复查，不夸大为诊断结论。",
    "sleep-review": "午睡与晚间作息波动，需要待复查。",
    "hydration-risk": "补水偏低且需结合饮食节奏跟进。",
    "sensitive-high-risk": "环境变化时情绪敏感，可作为高风险会诊样本。",
    "mild-health": "有轻度健康观察信号，需保守跟进。",
    "family-gap": "家长反馈闭环偏弱，适合演示家园协同缺口。",
    "growth-review": "成长观察待继续复核，不包装成诊断结论。",
    "review-lite": "需要留一个待复查点，便于后续演示闭环。",
    "picky-lite": "偶发偏食，需要继续鼓励多样化进食。",
    "hydration-lite": "饮水量偏低但尚可通过提醒改善。",
    "stable": "已适应托育环境，可作为稳定背景样本。",
}


def _resolve_now(now: datetime | None = None) -> datetime:
    base = now or datetime.now(DEMO_TZ)
    if base.tzinfo is None:
        return base.replace(tzinfo=DEMO_TZ)
    return base.astimezone(DEMO_TZ)


def _date_text(now: datetime, days_ago: int) -> str:
    return (now - timedelta(days=days_ago)).date().isoformat()


def _datetime_text(now: datetime, days_ago: int, *, hour: int, minute: int) -> str:
    local = (now - timedelta(days=days_ago)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.isoformat()


def _date_from_now(now: datetime, days_from_now: int) -> str:
    return (now + timedelta(days=days_from_now)).date().isoformat()


def _datetime_from_now(now: datetime, days_from_now: int, *, hour: int, minute: int) -> str:
    local = (now + timedelta(days=days_from_now)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.isoformat()


def _record_id(prefix: str, child_id: str, suffix: str) -> str:
    return f"{prefix}-{child_id}-{suffix}"


def _guardian(seed: dict[str, Any]) -> list[dict[str, Any]]:
    relation = "father" if seed["gender"] == "male" else "mother"
    label = "爸爸" if relation == "father" else "妈妈"
    child_index = int(seed["id"].split("-")[1])
    return [{"name": f"{seed['name'][0]}{label}", "relation": relation, "phone": f"1380000{child_index:04d}"}]


def _child_list_item(child: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": child["id"],
        "name": child["name"],
        "nickname": child.get("nickname"),
        "className": child["className"],
        "institutionId": child["institutionId"],
    }


def _ordered_selected_first(items: list[dict[str, Any]], selected_id: str) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: (item.get("id") != selected_id, item.get("className", ""), item.get("id", "")))


def _build_children() -> list[dict[str, Any]]:
    children: list[dict[str, Any]] = []
    for index, seed in enumerate(CHILD_SEEDS, start=1):
        focus = SCENARIO_BY_CHILD[seed["id"]]
        children.append(
            {
                "id": seed["id"],
                "name": seed["name"],
                "nickname": seed["nickname"],
                "birthDate": seed["birthDate"],
                "gender": seed["gender"],
                "allergies": list(seed["allergies"]),
                "heightCm": 88 + ((index * 3) % 24),
                "weightKg": round(13.2 + ((index * 5) % 18) / 2.0, 1),
                "guardians": _guardian(seed),
                "institutionId": INSTITUTION_ID,
                "className": seed["className"],
                "specialNotes": SPECIAL_NOTES_BY_FOCUS[focus],
            }
        )
    return children


def _build_attendance_records(child: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    child_number = int(child["id"].split("-")[1])
    records: list[dict[str, Any]] = []
    for days_ago in ATTENDANCE_DAYS:
        status = "present"
        if days_ago == 0 and child_number in TODAY_ABSENT_CHILD_NUMBERS:
            status = "absent"
        elif days_ago == 0 and child_number in TODAY_LATE_CHILD_NUMBERS:
            status = "late"
        elif days_ago == 1 and child_number in {18, 30}:
            status = "late"
        elif days_ago == 2 and child_number in {4, 25, 33}:
            status = "absent"
        records.append(
            {
                "id": _record_id("attendance", child["id"], str(days_ago)),
                "childId": child["id"],
                "date": _date_text(now, days_ago),
                "status": status,
                "checkedInAt": _datetime_text(now, days_ago, hour=8, minute=36 + (child_number % 8)),
            }
        )
    return records


def _demo_meal_photo_urls(child_id: str, date_text: str, meal: str) -> list[str]:
    library = DEMO_MEAL_PHOTO_LIBRARY.get(meal, [])
    if not library:
        return []

    seed = sum(ord(char) for char in f"{child_id}-{date_text}-{meal}")
    return [library[seed % len(library)]]


def _meal_record(
    child: dict[str, Any],
    now: datetime,
    *,
    days_ago: int,
    foods: list[str],
    intake_level: str,
    preference: str,
    water_ml: int,
    nutrition_score: int,
    summary: str,
) -> dict[str, Any]:
    return {
        "id": _record_id("meal", child["id"], str(days_ago)),
        "childId": child["id"],
        "date": _date_text(now, days_ago),
        "meal": "lunch",
        "foods": foods,
        "photoUrls": _demo_meal_photo_urls(child["id"], _date_text(now, days_ago), "lunch"),
        "intakeLevel": intake_level,
        "preference": preference,
        "waterMl": water_ml,
        "nutritionScore": nutrition_score,
        "aiEvaluation": {"summary": summary},
    }


def _build_meal_records(child: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    focus = SCENARIO_BY_CHILD[child["id"]]
    if focus == "picky-eating":
        return [
            _meal_record(child, now, days_ago=0, foods=["米饭", "蒸蛋", "青菜"], intake_level="low", preference="dislike", water_ml=115, nutrition_score=63, summary="偏爱主食和鸡蛋，蔬菜基本未动。"),
            _meal_record(child, now, days_ago=2, foods=["面条", "胡萝卜", "鸡肉"], intake_level="low", preference="dislike", water_ml=120, nutrition_score=65, summary="重复挑出胡萝卜，只愿意吃面和鸡肉。"),
            _meal_record(child, now, days_ago=4, foods=["米饭", "南瓜", "鱼丸"], intake_level="medium", preference="neutral", water_ml=135, nutrition_score=71, summary="主食接受度尚可，但仍需要鼓励尝试蔬菜。"),
            _meal_record(child, now, days_ago=6, foods=["小米饭", "西兰花", "牛肉"], intake_level="low", preference="dislike", water_ml=110, nutrition_score=64, summary="看到西兰花后出现回避，进食速度明显变慢。"),
        ]
    if focus == "hydration-risk":
        return [
            _meal_record(child, now, days_ago=0, foods=["米饭", "鸡肉", "青菜"], intake_level="medium", preference="neutral", water_ml=90, nutrition_score=73, summary="进食尚可，但全天饮水偏低，需要反复提醒。"),
            _meal_record(child, now, days_ago=1, foods=["小馄饨", "豆腐", "菠菜"], intake_level="medium", preference="neutral", water_ml=88, nutrition_score=72, summary="午餐接受度稳定，但补水仍偏少。"),
            _meal_record(child, now, days_ago=3, foods=["米饭", "虾仁替代菜", "南瓜"], intake_level="good", preference="accept", water_ml=96, nutrition_score=77, summary="避开过敏食物后进食更顺利，但仍需要定时喝水。"),
            _meal_record(child, now, days_ago=5, foods=["面条", "鸡丝", "油麦菜"], intake_level="medium", preference="neutral", water_ml=92, nutrition_score=74, summary="进食正常，饮水仍偏少。"),
        ]
    if focus == "hydration-lite":
        return [
            _meal_record(child, now, days_ago=0, foods=["米饭", "豆腐", "青菜"], intake_level="medium", preference="neutral", water_ml=118, nutrition_score=76, summary="进食平稳，下午喝水量仍偏少。"),
            _meal_record(child, now, days_ago=3, foods=["鸡肉", "南瓜", "米饭"], intake_level="good", preference="accept", water_ml=122, nutrition_score=80, summary="整体进食不错，但需要继续提醒补水。"),
            _meal_record(child, now, days_ago=5, foods=["粥", "鸡蛋", "西兰花"], intake_level="medium", preference="neutral", water_ml=115, nutrition_score=75, summary="饮水量略低于班级平均。"),
        ]
    if focus == "picky-lite":
        return [
            _meal_record(child, now, days_ago=0, foods=["米饭", "鸡肉", "西兰花"], intake_level="medium", preference="neutral", water_ml=132, nutrition_score=74, summary="对新蔬菜略有犹豫，但在提醒后愿意尝试一口。"),
            _meal_record(child, now, days_ago=3, foods=["面条", "胡萝卜", "牛肉"], intake_level="low", preference="dislike", water_ml=128, nutrition_score=70, summary="会先挑出胡萝卜，需要同伴示范后才继续吃。"),
            _meal_record(child, now, days_ago=5, foods=["米饭", "南瓜", "鱼丸"], intake_level="medium", preference="neutral", water_ml=130, nutrition_score=73, summary="熟悉食物接受度更高。"),
        ]
    intake_level = "good" if focus.startswith("positive") or focus == "stable" else "medium"
    preference = "accept" if intake_level == "good" else "neutral"
    base_score = 86 if intake_level == "good" else 79
    water = 165 if intake_level == "good" else 148
    summary = "主食、蛋白和蔬菜搭配稳定，饮水记录正常。"
    if focus in {"transition-watch", "family-gap", "growth-review", "review-lite", "sleep-review", "sensitive-high-risk", "separation-sleep"}:
        summary = "进食基本完成，仍需结合情绪和作息一起观察。"
    if focus == "impulse-watch":
        summary = "进食速度快，等待加餐时容易着急，需要提醒轮流。"
    return [
        _meal_record(child, now, days_ago=1, foods=["米饭", "鸡肉", "青菜"], intake_level=intake_level, preference=preference, water_ml=water, nutrition_score=base_score, summary=summary),
        _meal_record(child, now, days_ago=4, foods=["面条", "豆腐", "南瓜"], intake_level="medium", preference="neutral", water_ml=max(water - 10, 120), nutrition_score=base_score - 4, summary="整体进食稳定，水量接近班级平均。"),
    ]


def _health_record(
    child: dict[str, Any],
    now: datetime,
    *,
    days_ago: int,
    temperature: float,
    mood: str,
    remark: str,
    is_abnormal: bool,
) -> dict[str, Any]:
    return {
        "id": _record_id("health", child["id"], str(days_ago)),
        "childId": child["id"],
        "date": _date_text(now, days_ago),
        "temperature": temperature,
        "mood": mood,
        "handMouthEye": "正常",
        "isAbnormal": is_abnormal,
        "remark": remark,
        "checkedBy": "李老师",
    }


def _build_health_records(child: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    focus = SCENARIO_BY_CHILD[child["id"]]
    if focus == "allergy-watch":
        return [
            _health_record(child, now, days_ago=0, temperature=36.7, mood="稳定", remark="点心后手背轻微泛红，已提醒避开鸡蛋类加餐。", is_abnormal=True),
            _health_record(child, now, days_ago=2, temperature=36.6, mood="稳定", remark="皮肤状态较昨日平稳，继续观察。", is_abnormal=False),
        ]
    if focus == "separation-sleep":
        return [
            _health_record(child, now, days_ago=0, temperature=36.6, mood="午睡前紧张", remark="晨检体温正常，但午睡前再次出现哭闹，需要安抚。", is_abnormal=False),
            _health_record(child, now, days_ago=2, temperature=36.5, mood="依恋老师", remark="入园时提到想妈妈，过渡时间仍偏长。", is_abnormal=False),
        ]
    if focus == "sleep-review":
        return [
            _health_record(child, now, days_ago=0, temperature=36.5, mood="疲惫", remark="近两天午睡质量偏差，上午活动时精神不足。", is_abnormal=False),
            _health_record(child, now, days_ago=1, temperature=36.6, mood="易躁", remark="前一晚入睡较晚，晨间明显困倦。", is_abnormal=False),
        ]
    if focus == "hydration-risk":
        return [
            _health_record(child, now, days_ago=0, temperature=36.6, mood="稍疲惫", remark="今日口唇偏干，提醒后才愿意补水。", is_abnormal=True),
            _health_record(child, now, days_ago=3, temperature=36.6, mood="稳定", remark="补水后精神状态稍有改善。", is_abnormal=False),
        ]
    if focus == "sensitive-high-risk":
        return [
            _health_record(child, now, days_ago=0, temperature=36.5, mood="敏感紧张", remark="换教室后出现明显紧张反应，需要老师单独陪伴。", is_abnormal=True),
            _health_record(child, now, days_ago=2, temperature=36.4, mood="恢复中", remark="环境变化时仍容易退缩。", is_abnormal=False),
        ]
    if focus == "mild-health":
        return [
            _health_record(child, now, days_ago=0, temperature=37.6, mood="疲惫", remark="晨检出现轻咳或喉咙发红，建议今天继续观察。", is_abnormal=True),
            _health_record(child, now, days_ago=2, temperature=36.7, mood="稳定", remark="前两日状态相对平稳。", is_abnormal=False),
        ]
    return [_health_record(child, now, days_ago=0, temperature=36.6, mood="稳定", remark="晨检状态平稳。", is_abnormal=False)]


def _growth_record(
    child: dict[str, Any],
    now: datetime,
    *,
    days_ago: int,
    category: str,
    tags: list[str],
    description: str,
    selected_indicators: list[str],
    needs_attention: bool = False,
    follow_up_action: str | None = None,
    review_status: str | None = None,
    review_days_ahead: int | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "id": _record_id("growth", child["id"], str(days_ago)),
        "childId": child["id"],
        "createdAt": _datetime_text(now, days_ago, hour=10, minute=10 + int(child["id"].split("-")[1]) % 20),
        "recorder": "李老师",
        "recorderRole": "teacher",
        "category": category,
        "tags": tags,
        "selectedIndicators": selected_indicators,
        "description": description,
        "needsAttention": needs_attention,
        "followUpAction": follow_up_action or "",
    }
    if review_status:
        record["reviewStatus"] = review_status
    if review_days_ahead is not None:
        record["reviewDate"] = _date_from_now(now, review_days_ahead)
    if days_ago <= 7:
        seed = sum(ord(char) for char in f"{child['id']}-{days_ago}-{category}")
        record["mediaUrls"] = [DEMO_GROWTH_MEDIA_LIBRARY[seed % len(DEMO_GROWTH_MEDIA_LIBRARY)]]
    return record


def _build_growth_records(child: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    focus = SCENARIO_BY_CHILD[child["id"]]
    positive_note = f"{child['name']} 今天在集体活动中表现稳定，愿意跟随老师完成任务。"
    if focus == "positive-emotion":
        return [_growth_record(child, now, days_ago=0, category="social-emotional", tags=["稳定", "主动问好"], description=f"{child['name']} 入园后恢复较快，愿意主动和老师说早安。", selected_indicators=["情绪调节"])]
    if focus == "positive-motor":
        return [_growth_record(child, now, days_ago=1, category="gross-motor", tags=["平衡", "专注"], description=f"{child['name']} 在户外活动中能稳定完成平衡路线，专注时间比上周更稳。", selected_indicators=["大动作"])]
    if focus == "positive-language":
        return [_growth_record(child, now, days_ago=1, category="language", tags=["表达清晰", "主动分享"], description=f"{child['name']} 今天能完整描述活动经过，并愿意回应同伴提问。", selected_indicators=["语言表达"])]
    if focus == "positive-selfcare":
        return [_growth_record(child, now, days_ago=2, category="self-care", tags=["自理", "带动同伴"], description=f"{child['name']} 今天能自主完成洗手和收纳，还会提醒同伴按步骤完成。", selected_indicators=["自理能力"])]
    if focus == "positive-fine-motor":
        return [_growth_record(child, now, days_ago=2, category="fine-motor", tags=["串珠", "专注"], description=f"{child['name']} 完成串珠和涂色任务时专注稳定，手部控制较好。", selected_indicators=["精细动作"])]
    if focus == "positive-social":
        return [_growth_record(child, now, days_ago=0, category="social", tags=["分享", "合作"], description=f"{child['name']} 主动邀请同伴合作，愿意等待轮流并分享材料。", selected_indicators=["社会交往"])]
    if focus == "transition-watch":
        return [_growth_record(child, now, days_ago=0, category="social-emotional", tags=["入园适应", "分离焦虑"], description=f"{child['name']} 入园后需要陪伴过渡约 10 分钟，之后能逐步参与活动。", selected_indicators=["情绪调节"], needs_attention=True, follow_up_action="继续使用固定接园和入园问候流程。")]
    if focus == "separation-sleep":
        return [
            _growth_record(child, now, days_ago=0, category="sleep-routine", tags=["午睡", "哭闹", "安抚"], description=f"{child['name']} 午睡前再次哭闹，需要抱抱和安抚后才肯躺下。", selected_indicators=["情绪调节"], needs_attention=True, follow_up_action="连续观察午睡前过渡，并同步家庭晚间作息。", review_status="待复查", review_days_ahead=1),
            _growth_record(child, now, days_ago=3, category="social-emotional", tags=["想妈妈", "依恋"], description=f"{child['name']} 晨间入园提到想妈妈，情绪平复前不愿离开老师。", selected_indicators=["情绪调节"], needs_attention=True, follow_up_action="留意入园过渡时长。"),
        ]
    if focus == "impulse-watch":
        return [_growth_record(child, now, days_ago=1, category="social", tags=["等待困难", "冲动"], description=f"{child['name']} 排队等待时容易着急，需要老师提醒轮流和降速。", selected_indicators=["社会交往"], needs_attention=True, follow_up_action="继续在规则游戏中练习等待。")]
    if focus == "picky-eating":
        return [_growth_record(child, now, days_ago=2, category="diet-behavior", tags=["偏食", "蔬菜回避"], description=f"{child['name']} 遇到新蔬菜仍以回避为主，熟悉食物接受度明显更高。", selected_indicators=["饮食行为"], needs_attention=True, follow_up_action="保持园内与家庭一致的食物引导方式。")]
    if focus == "language-review":
        return [
            _growth_record(child, now, days_ago=0, category="language", tags=["咿呀", "模仿"], description=f"{child['name']} 能回应点名并模仿单音节表达，但主动表达仍偏少。", selected_indicators=["语言表达"], needs_attention=True, follow_up_action="两周内继续观察词汇和跟读意愿。", review_status="待复查", review_days_ahead=2),
            _growth_record(child, now, days_ago=4, category="language", tags=["模仿", "指认"], description=f"{child['name']} 对图片指认反应积极，愿意跟随老师发音。", selected_indicators=["语言表达"]),
        ]
    if focus == "sleep-review":
        return [
            _growth_record(child, now, days_ago=0, category="sleep-routine", tags=["难入睡", "易醒"], description=f"{child['name']} 午睡入睡时间再次超过 25 分钟，醒后情绪恢复偏慢。", selected_indicators=["睡眠作息"], needs_attention=True, follow_up_action="连续记录晚间入睡时间并校对午睡质量。", review_status="待复查", review_days_ahead=1),
            _growth_record(child, now, days_ago=2, category="social-emotional", tags=["疲惫", "易躁"], description=f"{child['name']} 因睡眠不足，在上午活动中更容易急躁。", selected_indicators=["情绪调节"], needs_attention=True, follow_up_action="优先保证睡前节奏。"),
        ]
    if focus == "hydration-risk":
        return [_growth_record(child, now, days_ago=1, category="diet-behavior", tags=["饮水偏低", "需提醒"], description=f"{child['name']} 今天补水依赖老师反复提醒，建议继续观察午后精神状态。", selected_indicators=["饮食行为"], needs_attention=True, follow_up_action="在园内外同步使用小水杯定时补水。")]
    if focus == "sensitive-high-risk":
        return [
            _growth_record(child, now, days_ago=0, category="social-emotional", tags=["环境变化", "退缩"], description=f"{child['name']} 换教室后情绪明显波动，躲在角落哭闹约 10 分钟。", selected_indicators=["情绪调节"], needs_attention=True, follow_up_action="保留固定安抚流程并减少突发环境变化。"),
            _growth_record(child, now, days_ago=3, category="social", tags=["敏感", "声响回撤"], description=f"{child['name']} 对突发声响较敏感，回教室过渡时需要单独陪伴。", selected_indicators=["社会交往"], needs_attention=True, follow_up_action="继续观察触发点并与家长同步。"),
        ]
    if focus == "family-gap":
        return [_growth_record(child, now, days_ago=2, category="daily-observation", tags=["待闭环"], description=f"{child['name']} 园内表现整体稳定，但近期家庭侧反馈尚未形成稳定闭环。", selected_indicators=["家园协同"], needs_attention=True, follow_up_action="尽快补齐家庭回传。")]
    if focus == "growth-review":
        return [_growth_record(child, now, days_ago=1, category="development", tags=["待复核"], description=f"{child['name']} 本周成长观察有新变化，建议继续保守观察。", selected_indicators=["成长观察"], needs_attention=True, follow_up_action="一周内复核一次新表现。", review_status="待复查", review_days_ahead=2)]
    if focus == "review-lite":
        return [_growth_record(child, now, days_ago=1, category="development", tags=["跟进", "复查点"], description=f"{child['name']} 本周出现一次轻微波动，建议留一个待复查点即可。", selected_indicators=["成长观察"], needs_attention=True, follow_up_action="保持轻量跟进。", review_status="待复查", review_days_ahead=3)]
    if focus == "picky-lite":
        return [_growth_record(child, now, days_ago=1, category="diet-behavior", tags=["挑食", "尝试"], description=f"{child['name']} 对少数新菜仍显谨慎，但在同伴示范下愿意尝试。", selected_indicators=["饮食行为"], needs_attention=True, follow_up_action="继续用小份尝试法。")]
    if focus == "hydration-lite":
        return [_growth_record(child, now, days_ago=2, category="diet-behavior", tags=["饮水提醒"], description=f"{child['name']} 下午活动后补水主动性偏弱，需要固定提醒。", selected_indicators=["饮食行为"], needs_attention=True, follow_up_action="午后活动后固定补水。")]
    if focus == "mild-health":
        return [_growth_record(child, now, days_ago=1, category="health-observation", tags=["健康观察", "轻症"], description=f"{child['name']} 今天有轻度不适信号，班级已保守跟进。", selected_indicators=["健康观察"], needs_attention=True, follow_up_action="关注 48 小时内体温和精神状态。")]
    return [_growth_record(child, now, days_ago=2, category="daily-observation", tags=["稳定"], description=positive_note, selected_indicators=["日常观察"])]


def _feedback_record(
    child: dict[str, Any],
    now: datetime,
    *,
    days_ago: int,
    status: str,
    content: str,
    child_reaction: str,
    improved: str,
    free_note: str,
) -> dict[str, Any]:
    return {
        "id": _record_id("feedback", child["id"], str(days_ago)),
        "childId": child["id"],
        "date": _date_text(now, days_ago),
        "status": status,
        "content": content,
        "sourceWorkflow": "manual",
        "executed": True,
        "childReaction": child_reaction,
        "improved": improved,
        "freeNote": free_note,
    }


def _build_feedback_records(child: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    child_id = child["id"]
    focus = SCENARIO_BY_CHILD[child_id]
    if child_id in NO_FEEDBACK_IDS:
        return []
    if focus == "separation-sleep":
        return [_feedback_record(child, now, days_ago=1, status="部分执行", content="昨晚已尝试提前进入睡前安静流程，但孩子仍会在说到午睡时变得黏人。", child_reaction="入睡前情绪波动仍较明显", improved="partial", free_note="需要继续和园内保持同一套安抚话术。")]
    if focus == "picky-eating":
        return [
            _feedback_record(child, now, days_ago=1, status="在家已配合", content="昨晚继续尝试把蔬菜藏在面食里，孩子愿意尝试几口。", child_reaction="对熟悉口味接受更高", improved="partial", free_note="希望继续和园内同步节奏。"),
            _feedback_record(child, now, days_ago=0, status="今晚反馈", content="今晚会继续用小份蔬菜加主食的方式，再看是否愿意主动入口。", child_reaction="待观察", improved="unknown", free_note="明早补充结果。"),
        ]
    if focus == "sleep-review":
        return [_feedback_record(child, now, days_ago=1, status="部分执行", content="前晚已尝试提前关灯，但昨晚又因玩具拖延入睡。", child_reaction="晨起仍显困倦", improved="partial", free_note="需要继续固定睡前节奏。")]
    if focus == "hydration-risk":
        return [_feedback_record(child, now, days_ago=0, status="已知晓", content="家里已准备带刻度的小水壶，今晚会继续提醒定时喝水。", child_reaction="在家喝水意愿一般", improved="unknown", free_note="明早反馈晚间补水情况。")]
    if focus == "sensitive-high-risk":
        return [_feedback_record(child, now, days_ago=0, status="今晚反馈", content="这两天在家确实更敏感，我们会减少突发声响并用绘本引导识别情绪。", child_reaction="需要安静环境时更愿意靠近家长", improved="partial", free_note="明天继续回传反应。")]
    if focus in {"positive-emotion", "positive-language", "positive-social", "positive-selfcare", "positive-motor", "positive-fine-motor"}:
        return [_feedback_record(child, now, days_ago=1, status="在家已配合", content=f"已看到 {child['name']} 今天的亮点记录，家里会继续用同样方式鼓励。", child_reaction="愿意复述今天最开心的瞬间", improved="yes", free_note="适合作为正向展示素材。")]
    if focus == "allergy-watch":
        return [_feedback_record(child, now, days_ago=2, status="已知晓", content="已确认家里和园里都继续避开鸡蛋点心。", child_reaction="状态稳定", improved="yes", free_note="会继续看皮肤变化。")]
    return [_feedback_record(child, now, days_ago=2, status="已知晓", content=f"已收到关于 {child['name']} 的日常观察，今晚会继续留意。", child_reaction="在家状态平稳", improved="unknown", free_note="如有新变化会同步老师。")]


def _parse_demo_datetime(value: Any) -> datetime | None:
    text = str(value).strip() if value is not None else ""
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=DEMO_TZ)


def _slot_from_anchor(anchor: str, *, day_offset: int = 0, hour: int, minute: int) -> str:
    parsed = _parse_demo_datetime(anchor) or _resolve_now()
    shifted = (parsed + timedelta(days=day_offset)).astimezone(DEMO_TZ)
    return shifted.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


def _consultation_specs() -> list[dict[str, Any]]:
    return [
        {
            "consultationId": "consultation-c-15",
            "childId": "c-15",
            "daysAgo": 0,
            "generatedHour": 17,
            "generatedMinute": 20,
            "recommendedHour": 10,
            "recommendedMinute": 30,
            "recommendedDaysFromNow": 1,
            "riskLevel": "high",
            "status": "pending",
            "shouldEscalateToAdmin": True,
            "ownerRole": "teacher",
            "ownerName": "向阳班主班老师",
            "triggerReason": "连续饮水偏低并叠加替代餐管理，已经能支撑饮食趋势与 follow-up 闭环。",
            "summary": "这条样本适合讲饮水提醒、替代餐记录、家庭晚间补水与周报趋势如何串成一条线。",
            "schoolActions": ["今日园内继续保留半小时饮水提醒，并记录主动饮水量和提醒后补水量。", "午后加餐后补一张水杯刻度示意图，供家长晚间对照反馈。"],
            "homeActions": ["今晚晚饭后完成一杯温水补水，并反馈孩子是主动喝还是需要提醒。", "睡前补一条是否仍有嘴唇干燥、拒水或明显口渴表现。"],
            "followUp48h": ["48 小时内对照园内与家庭补水记录，确认是否回到稳定区间。"],
            "observationPoints": ["主动饮水次数", "午后补水量", "晚间补水配合度"],
            "keyFindings": ["补水问题已连续多天出现", "替代餐管理和饮水提醒必须一起看"],
            "healthSignal": "晨检无发热，但口唇偏干，提醒后才愿意补水。",
            "mealSignal": "午餐完成度尚可，水杯刻度下降速度明显慢于同龄样本。",
            "familySignal": "家长反馈回家后也需要频繁提醒才会继续喝水。",
            "schoolSignal": "下午两点后的主动饮水明显放缓，适合纳入 weekly trend。",
        },
        {
            "consultationId": "consultation-c-14",
            "childId": "c-14",
            "daysAgo": 1,
            "generatedHour": 16,
            "generatedMinute": 50,
            "recommendedHour": 11,
            "recommendedMinute": 0,
            "recommendedDaysFromNow": 1,
            "riskLevel": "high",
            "status": "in_progress",
            "shouldEscalateToAdmin": True,
            "ownerRole": "teacher",
            "ownerName": "晨曦班主班老师",
            "triggerReason": "午睡入睡困难和晚间作息波动没有稳定改善，白天疲惫与易躁重复出现。",
            "summary": "这条样本适合讲“连续几天观察后才升级 review”，不是一次性异常，也不是夸大的诊断结论。",
            "schoolActions": ["今日园内继续保留固定白噪音和低刺激床位，并记录午睡入睡时长。", "午休后补一条醒后情绪与精力状态记录，避免只看睡了多久。"],
            "homeActions": ["今晚 21:00 前关闭屏幕，执行固定洗漱-故事-关灯顺序。", "若再次晚睡，请直接反馈卡在入睡前的哪个环节。"],
            "followUp48h": ["48 小时复查时同时回看午睡时长、醒后情绪和晚间入睡时间。"],
            "observationPoints": ["午睡入睡时长", "醒后情绪", "晚间上床时间"],
            "keyFindings": ["睡眠波动正在影响白天情绪稳定", "需要家园两端使用同一套作息节奏"],
            "healthSignal": "晨间持续困倦，上半天活动时精力不足。",
            "mealSignal": "进食完成度尚可，但疲惫时进食速度明显变慢。",
            "familySignal": "家长反馈前一晚再次超过 22:30 才入睡。",
            "schoolSignal": "午睡超过 25 分钟仍未入睡，醒后情绪恢复慢。",
        },
        {
            "consultationId": "consultation-c-8",
            "childId": "c-8",
            "daysAgo": 1,
            "generatedHour": 15,
            "generatedMinute": 40,
            "recommendedHour": 9,
            "recommendedMinute": 30,
            "recommendedDaysFromNow": 1,
            "riskLevel": "medium",
            "status": "pending",
            "shouldEscalateToAdmin": True,
            "ownerRole": "teacher",
            "ownerName": "向阳班配班老师",
            "triggerReason": "入园分离焦虑和午睡前黏附行为仍有反复，但已经出现改善苗头。",
            "summary": "这条样本适合 Teacher 端讲连续观察，也适合 Admin 端讲为什么仍要保留一条 48 小时 follow-up。",
            "schoolActions": ["维持固定接园话术和安抚玩具，不临时更换照护人。", "离园前补一条午睡前哭闹时长和恢复方式，避免只写“已安抚”。"],
            "homeActions": ["今晚只做一轮短时分离练习，不额外加难度。", "完成后反馈孩子是更快平静还是再次明显黏附家长。"],
            "followUp48h": ["48 小时内回看入园分离时长与家庭短时分离练习反应是否同步缩短。"],
            "observationPoints": ["入园哭闹时长", "午睡前黏附程度", "家庭短时分离练习反应"],
            "keyFindings": ["分离焦虑有改善但不稳定", "家庭反馈缺口会直接影响判断"],
            "healthSignal": "晨检体温正常，但午睡前黏附老师更明显。",
            "mealSignal": "饮食完成度基本正常，紧张时会短暂停下勺子。",
            "familySignal": "最近两晚分离练习的反馈不完整，影响闭环判断。",
            "schoolSignal": "午睡前哭闹时长虽下降，但仍需要老师近身陪伴。",
        },
        {
            "consultationId": "consultation-c-11",
            "childId": "c-11",
            "daysAgo": 2,
            "generatedHour": 16,
            "generatedMinute": 10,
            "recommendedHour": 10,
            "recommendedMinute": 0,
            "recommendedDaysFromNow": 1,
            "riskLevel": "medium",
            "status": "pending",
            "shouldEscalateToAdmin": True,
            "ownerRole": "teacher",
            "ownerName": "向阳班主班老师",
            "triggerReason": "偏食与蔬果摄入低已经形成连续样本，适合展示餐食记录如何支撑家园协同。",
            "summary": "这条样本不是为了制造高风险，而是为了让 Teacher / Admin / weekly-report 都有一条能讲饮食结构改善的案例。",
            "schoolActions": ["今日继续用小份尝试法引导蔬菜入口，并记录第一口接受方式。", "午餐后补一条“熟悉食物 vs 新食物”完成度对照，支撑周报趋势解读。"],
            "homeActions": ["今晚只保留一种熟悉主食，再搭配一小份蔬菜，不同时增加难度。", "反馈孩子是直接拒绝、尝试一口，还是愿意在熟悉食物后继续入口。"],
            "followUp48h": ["48 小时内回看蔬菜尝试量和家庭执行难度，决定是否升级更细的饮食引导。"],
            "observationPoints": ["第一口接受方式", "蔬果尝试量", "家庭执行阻力"],
            "keyFindings": ["偏食问题已经有连续记录", "比起高风险，更适合讲趋势和家园协同"],
            "healthSignal": "晨检状态稳定，但午餐前对新蔬菜仍明显犹豫。",
            "mealSignal": "熟悉主食接受度高，新蔬菜入口量持续偏低。",
            "familySignal": "家长愿意配合，但希望老师给出更具体的尝试节奏。",
            "schoolSignal": "园内记录已能区分“拒绝”“尝试一口”“继续入口”三种表现。",
        },
        {
            "consultationId": "consultation-c-1",
            "childId": "c-1",
            "daysAgo": 0,
            "generatedHour": 14,
            "generatedMinute": 35,
            "recommendedHour": 9,
            "recommendedMinute": 20,
            "recommendedDaysFromNow": 1,
            "riskLevel": "low",
            "status": "in_progress",
            "shouldEscalateToAdmin": False,
            "ownerRole": "parent",
            "ownerName": "林妈妈",
            "triggerReason": "午睡前情绪波动和晚间作息反馈形成了一个轻量但完整的家园闭环样本。",
            "summary": "这条样本专门服务 Parent 端录屏，让 /parent 和 /parent/agent 不只是有功能，还有最新上下文可讲。",
            "schoolActions": ["今日园内继续保留午睡前固定安抚提示，并记录平静下来所需时长。", "离园前补一条老师观察到的正向变化，帮助家长晚间延续同一节奏。"],
            "homeActions": ["今晚继续使用同一套睡前安抚顺序，只观察情绪是否更快稳定。", "睡前补一条孩子对故事、关灯和上床顺序的接受情况。"],
            "followUp48h": ["48 小时内回看情绪稳定时长和晚间作息是否同步改善。"],
            "observationPoints": ["午睡前安抚时长", "晚间入睡顺序配合度", "第二天入园情绪"],
            "keyFindings": ["轻量 follow-up 也能形成完整闭环", "适合 Parent 端稳定录屏讲述"],
            "healthSignal": "晨检正常，午睡前情绪波动较上周更快恢复。",
            "mealSignal": "餐食完成度稳定，午餐后情绪切换比之前顺畅。",
            "familySignal": "家长近两晚都能按固定顺序执行，愿意继续补反馈。",
            "schoolSignal": "老师已能观察到午睡前情绪恢复时长缩短。",
        },
    ]


def _consultation_participants() -> list[dict[str, Any]]:
    return [
        {"id": "health-agent", "label": "Health Agent"},
        {"id": "diet-agent", "label": "Diet Agent"},
        {"id": "coparenting-agent", "label": "Parent Agent"},
        {"id": "execution-agent", "label": "Execution Agent"},
        {"id": "coordinator", "label": "Coordinator"},
    ]


def _consultation_finding(agent_id: str, title: str, signal: str, action: str, observation_point: str) -> dict[str, Any]:
    return {
        "agentId": agent_id,
        "title": title,
        "riskExplanation": signal,
        "signals": [signal],
        "actions": [action],
        "observationPoints": [observation_point],
        "evidence": [signal],
    }


def _consultation_agent_view(role: str, title: str, summary: str, signal: str, action: str, observation_point: str) -> dict[str, Any]:
    return {
        "role": role,
        "title": title,
        "summary": summary,
        "signals": [signal],
        "actions": [action],
        "observationPoints": [observation_point],
        "evidence": [signal],
    }


def _build_demo_consultation_result(child: dict[str, Any], spec: dict[str, Any], now: datetime) -> dict[str, Any]:
    generated_at = _datetime_text(now, spec["daysAgo"], hour=spec["generatedHour"], minute=spec["generatedMinute"])
    recommended_at = _datetime_from_now(now, spec["recommendedDaysFromNow"], hour=spec["recommendedHour"], minute=spec["recommendedMinute"])
    return {
        "consultationId": spec["consultationId"],
        "childId": child["id"],
        "generatedAt": generated_at,
        "riskLevel": spec["riskLevel"],
        "triggerReason": spec["triggerReason"],
        "triggerType": ["multi-risk", *([] if spec["riskLevel"] == "low" else ["continuous-abnormality"]), *([] if not spec["shouldEscalateToAdmin"] else ["admin-priority"])],
        "triggerReasons": [spec["triggerReason"], f"{child['name']} 的园内观察与家庭反馈需要继续形成闭环。"],
        "participants": _consultation_participants(),
        "agentFindings": [
            _consultation_finding("health-agent", "健康与情绪观察需要联动", spec["healthSignal"], spec["schoolActions"][0], spec["observationPoints"][0]),
            _consultation_finding("diet-agent", "饮食与补水记录需要纳入判断", spec["mealSignal"], spec["schoolActions"][1] if len(spec["schoolActions"]) > 1 else spec["schoolActions"][0], spec["observationPoints"][1] if len(spec["observationPoints"]) > 1 else spec["observationPoints"][0]),
            _consultation_finding("coparenting-agent", "需要家庭侧补齐今晚反馈", spec["familySignal"], spec["homeActions"][0], spec["observationPoints"][2] if len(spec["observationPoints"]) > 2 else spec["observationPoints"][0]),
            _consultation_finding("execution-agent", "园内执行与离园前同步必须保留", spec["schoolSignal"], spec["schoolActions"][0], spec["observationPoints"][0]),
        ],
        "summary": spec["summary"],
        "keyFindings": list(spec["keyFindings"]),
        "healthAgentView": _consultation_agent_view("HealthObservationAgent", "Health Agent", spec["healthSignal"], spec["healthSignal"], spec["schoolActions"][0], spec["observationPoints"][0]),
        "dietBehaviorAgentView": _consultation_agent_view("DietBehaviorAgent", "Diet Agent", spec["mealSignal"], spec["mealSignal"], spec["schoolActions"][1] if len(spec["schoolActions"]) > 1 else spec["schoolActions"][0], spec["observationPoints"][1] if len(spec["observationPoints"]) > 1 else spec["observationPoints"][0]),
        "parentCommunicationAgentView": _consultation_agent_view("ParentCommunicationAgent", "Parent Agent", spec["familySignal"], spec["familySignal"], spec["homeActions"][0], spec["observationPoints"][2] if len(spec["observationPoints"]) > 2 else spec["observationPoints"][0]),
        "inSchoolActionAgentView": _consultation_agent_view("InSchoolActionAgent", "Execution Agent", spec["schoolSignal"], spec["schoolSignal"], spec["schoolActions"][0], spec["observationPoints"][0]),
        "todayInSchoolActions": list(spec["schoolActions"]),
        "tonightAtHomeActions": list(spec["homeActions"]),
        "followUp48h": list(spec["followUp48h"]),
        "parentMessageDraft": f"今晚先执行：{spec['homeActions'][0]} 完成后补一条孩子反应，明天老师继续承接。",
        "directorDecisionCard": {
            "title": "重点会诊决策卡",
            "reason": spec["triggerReason"],
            "recommendedOwnerRole": spec["ownerRole"],
            "recommendedOwnerName": spec["ownerName"],
            "recommendedAt": recommended_at,
            "status": spec["status"],
        },
        "explainability": [{"label": "关键发现", "detail": spec["keyFindings"][0]}, {"label": "闭环原因", "detail": spec["triggerReason"]}],
        "evidenceItems": [
            {
                "id": f"ce:{spec['consultationId']}:history",
                "sourceType": "consultation_history",
                "sourceLabel": "演示连续性说明",
                "sourceId": f"demo-history-{child['id']}",
                "summary": spec["triggerReason"],
                "confidence": "high" if spec["riskLevel"] == "high" else "medium",
                "requiresHumanReview": False,
                "evidenceCategory": "risk_control",
                "supports": [{"type": "finding", "targetId": "finding:key:0", "targetLabel": spec["triggerReason"]}],
                "timestamp": generated_at,
                "metadata": {"sourceField": "demo_snapshot", "provenance": {"provider": "demo-seed", "source": "mock"}},
            },
            {
                "id": f"ce:{spec['consultationId']}:summary",
                "sourceType": "derived_explainability",
                "sourceLabel": "演示协调结论",
                "sourceId": f"demo-explainability-{child['id']}",
                "summary": spec["summary"],
                "confidence": "medium",
                "requiresHumanReview": False,
                "evidenceCategory": "family_communication",
                "supports": [{"type": "action", "targetId": "action:followup:0", "targetLabel": spec["followUp48h"][0]}],
                "timestamp": generated_at,
                "metadata": {"sourceField": "demo_snapshot", "provenance": {"provider": "demo-seed", "source": "mock"}},
            },
        ],
        "nextCheckpoints": list(spec["observationPoints"]),
        "coordinatorSummary": {
            "finalConclusion": spec["summary"],
            "riskLevel": spec["riskLevel"],
            "problemDefinition": spec["triggerReason"],
            "schoolAction": spec["schoolActions"][0],
            "homeAction": spec["homeActions"][0],
            "observationPoints": list(spec["observationPoints"]),
            "reviewIn48h": spec["followUp48h"][0],
            "shouldEscalateToAdmin": spec["shouldEscalateToAdmin"],
        },
        "schoolAction": spec["schoolActions"][0],
        "homeAction": spec["homeActions"][0],
        "observationPoints": list(spec["observationPoints"]),
        "reviewIn48h": spec["followUp48h"][0],
        "shouldEscalateToAdmin": spec["shouldEscalateToAdmin"],
        "status": spec["status"],
        "ownerRole": spec["ownerRole"],
        "ownerName": spec["ownerName"],
        "dueAt": recommended_at,
        "whyHighPriority": spec["triggerReason"],
        "syncTargets": ["教师端结果卡", "家长端今晚任务", *([] if not spec["shouldEscalateToAdmin"] else ["园长端决策卡"])],
        "continuityNotes": [f"Demo recovery hotfix seed for {child['name']}."],
        "memoryMeta": {"backend": "demo_snapshot", "degraded": False, "usedSources": ["demo_snapshot", "demo_consultations"], "errors": [], "matchedSnapshotIds": [], "matchedTraceIds": []},
        "source": "mock",
        "provider": "demo-seed",
        "model": "demo-consultation-v2",
        "providerTrace": {"provider": "demo-seed", "source": "demo-fallback", "transport": "fastapi-brain", "transportSource": "fastapi-brain", "consultationSource": "demo_snapshot", "fallbackReason": "demo-snapshot", "brainProvider": "demo-seed", "model": "demo-consultation-v2", "realProvider": False, "fallback": True},
        "traceMeta": {"childName": child["name"], "className": child["className"], "keyFindings": list(spec["keyFindings"])},
        "realProvider": False,
        "fallback": True,
    }


def _build_demo_consultation_results(now: datetime) -> list[dict[str, Any]]:
    child_map = {child["id"]: child for child in _build_children()}
    return [_build_demo_consultation_result(child_map[spec["childId"]], spec, now) for spec in _consultation_specs()]


def _build_demo_consultation_feed_item(result: dict[str, Any]) -> dict[str, Any]:
    trace_meta = result.get("traceMeta", {})
    child_name = str(trace_meta.get("childName") or result.get("childId") or "").strip()
    class_name = str(trace_meta.get("className") or "").strip()
    key_findings = [str(item).strip() for item in result.get("keyFindings", []) if str(item).strip()]
    return {
        "consultationId": result["consultationId"],
        "childId": result["childId"],
        "generatedAt": result["generatedAt"],
        "riskLevel": result["riskLevel"],
        "triggerReason": result["triggerReason"],
        "triggerReasons": list(result["triggerReasons"]),
        "summary": result["summary"],
        "directorDecisionCard": copy.deepcopy(result["directorDecisionCard"]),
        "status": result["status"],
        "ownerName": result["ownerName"],
        "ownerRole": result["ownerRole"],
        "dueAt": result["dueAt"],
        "whyHighPriority": result["whyHighPriority"],
        "todayInSchoolActions": list(result["todayInSchoolActions"]),
        "tonightAtHomeActions": list(result["tonightAtHomeActions"]),
        "followUp48h": list(result["followUp48h"]),
        "syncTargets": list(result["syncTargets"]),
        "shouldEscalateToAdmin": bool(result["shouldEscalateToAdmin"]),
        "evidenceItems": copy.deepcopy(result["evidenceItems"]),
        "explainabilitySummary": {
            "agentParticipants": [str(item.get("label", "")).strip() for item in result.get("participants", []) if str(item.get("label", "")).strip()],
            "keyFindings": key_findings,
            "coordinationConclusion": result["summary"],
            "evidenceHighlights": [text for text in [f"child: {child_name}" if child_name else "", f"class: {class_name}" if class_name else "", *key_findings[:2]] if text],
        },
        "providerTraceSummary": {"traceId": f"demo-trace-{result['childId']}", "status": "fallback", "provider": "demo-seed", "source": "demo-fallback", "model": result.get("model", "demo-consultation-v2"), "transport": "fastapi-brain", "transportSource": "fastapi-brain", "consultationSource": "demo_snapshot", "fallbackReason": "demo-snapshot", "brainProvider": "demo-seed", "realProvider": False, "fallback": True},
        "memoryMetaSummary": {"backend": "demo_snapshot", "degraded": False, "usedSources": ["demo_snapshot", "demo_consultations"], "errors": [], "matchedSnapshotIds": [], "matchedTraceIds": []},
    }


def _build_demo_intervention_cards(consultations: list[dict[str, Any]], child_map: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for consultation in consultations:
        child = child_map.get(str(consultation["childId"]))
        if child is None:
            continue
        cards.append(
            {
                "id": f"card-{child['id']}",
                "title": f"{child['name']} 干预卡",
                "riskLevel": consultation["riskLevel"],
                "targetChildId": child["id"],
                "triggerReason": consultation["triggerReason"],
                "summary": consultation["summary"],
                "todayInSchoolAction": consultation["todayInSchoolActions"][0],
                "todayInSchoolActions": list(consultation["todayInSchoolActions"]),
                "tonightHomeAction": consultation["tonightAtHomeActions"][0],
                "homeSteps": list(consultation["tonightAtHomeActions"]),
                "observationPoints": list(consultation["observationPoints"]),
                "tomorrowObservationPoint": consultation["observationPoints"][0],
                "reviewIn48h": consultation["reviewIn48h"],
                "parentMessageDraft": consultation["parentMessageDraft"],
                "teacherFollowupDraft": f"明天继续跟进 {child['name']}，重点复盘：{consultation['reviewIn48h']}",
                "consultationMode": True,
                "consultationId": consultation["consultationId"],
                "consultationSummary": consultation["summary"],
                "participants": [str(item.get("id", "")).strip() for item in consultation.get("participants", []) if str(item.get("id", "")).strip()],
                "shouldEscalateToAdmin": bool(consultation["shouldEscalateToAdmin"]),
                "source": consultation.get("source", "mock"),
                "model": consultation.get("model", "demo-consultation-v2"),
                "createdAt": consultation["generatedAt"],
                "updatedAt": consultation["generatedAt"],
            }
        )
    return cards


def _feedback_submitted_at(record: dict[str, Any]) -> str:
    date_text = str(record.get("date") or _date_text(_resolve_now(), 0)).strip()
    child_id = str(record.get("childId") or "c-1")
    child_number = int(child_id.split("-")[1]) if "-" in child_id and child_id.split("-")[1].isdigit() else 1
    hour = 21 if str(record.get("status", "")).strip() == "浠婃櫄鍙嶉" else 20
    minute = 8 + (child_number % 11) * 3
    return datetime.fromisoformat(f"{date_text}T{hour:02d}:{minute:02d}:00+08:00").isoformat()


def _build_demo_tasks(
    consultations: list[dict[str, Any]],
    intervention_cards: list[dict[str, Any]],
    feedback_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    family_status = {"c-1": "completed", "c-8": "in_progress", "c-11": "in_progress", "c-14": "in_progress", "c-15": "pending"}
    teacher_status = {"c-1": "completed", "c-8": "pending", "c-11": "pending", "c-14": "in_progress", "c-15": "in_progress"}
    admin_status = {"c-15": "pending", "c-14": "in_progress", "c-8": "pending", "c-11": "pending"}
    feedback_time_by_child = {str(record.get("childId")): _feedback_submitted_at(record) for record in feedback_records if str(record.get("childId") or "").strip()}
    cards_by_child = {card["targetChildId"]: card for card in intervention_cards}
    tasks: list[dict[str, Any]] = []
    for consultation in consultations:
        child_id = str(consultation["childId"])
        card = cards_by_child.get(child_id)
        if card is None:
            continue
        parent_due_at = _slot_from_anchor(card["createdAt"], hour=21, minute=0)
        parent_feedback_at = feedback_time_by_child.get(child_id)
        parent_state = family_status.get(child_id, "pending")
        related_task_ids = [f"task-followup-{child_id}"]
        if consultation["shouldEscalateToAdmin"]:
            related_task_ids.append(f"task-admin-{child_id}")
        tasks.append(
            {
                "taskId": f"task-parent-{child_id}",
                "taskType": "intervention",
                "childId": child_id,
                "sourceType": "intervention_card",
                "sourceId": card["id"],
                "ownerRole": "parent",
                "title": f"{card['title']} 浠婃櫄瀹跺涵閰嶅悎",
                "description": card["tonightHomeAction"],
                "dueWindow": {"kind": "same_day", "label": "浠婃櫄瀹屾垚"},
                "dueAt": parent_due_at,
                "status": parent_state,
                "evidenceSubmissionMode": "guardian_feedback",
                "createdAt": card["createdAt"],
                "updatedAt": parent_feedback_at or card["updatedAt"],
                "statusChangedAt": parent_feedback_at or card["updatedAt"],
                "completedAt": parent_feedback_at if parent_state == "completed" else None,
                "lastEvidenceAt": parent_feedback_at,
                "relatedTaskIds": list(related_task_ids),
                "legacyRefs": {
                    "interventionCardId": card["id"],
                    "consultationId": consultation["consultationId"],
                    "reminderIds": [f"reminder-family-{card['id']}"],
                },
            }
        )
        teacher_due_at = _slot_from_anchor(card["createdAt"], day_offset=2, hour=9, minute=30)
        teacher_state = teacher_status.get(child_id, "pending")
        teacher_evidence_at = _slot_from_anchor(card["createdAt"], day_offset=1, hour=9, minute=40)
        tasks.append(
            {
                "taskId": f"task-followup-{child_id}",
                "taskType": "follow_up",
                "childId": child_id,
                "sourceType": "intervention_card",
                "sourceId": card["id"],
                "ownerRole": "teacher",
                "title": f"{card['title']} 48h 澶嶆煡",
                "description": card["reviewIn48h"],
                "dueWindow": {"kind": "within_48h", "label": "48灏忔椂澶嶆煡"},
                "dueAt": teacher_due_at,
                "status": teacher_state,
                "evidenceSubmissionMode": "task_checkin",
                "createdAt": card["createdAt"],
                "updatedAt": teacher_evidence_at if teacher_state != "pending" else card["updatedAt"],
                "statusChangedAt": teacher_evidence_at if teacher_state != "pending" else card["updatedAt"],
                "completedAt": teacher_evidence_at if teacher_state == "completed" else None,
                "lastEvidenceAt": teacher_evidence_at if teacher_state != "pending" else None,
                "relatedTaskIds": [f"task-parent-{child_id}", *([] if not consultation["shouldEscalateToAdmin"] else [f"task-admin-{child_id}"])],
                "legacyRefs": {
                    "interventionCardId": card["id"],
                    "consultationId": consultation["consultationId"],
                    "reminderIds": [f"reminder-review-{card['id']}"],
                },
            }
        )
        if consultation["shouldEscalateToAdmin"]:
            admin_state = admin_status.get(child_id, "pending")
            admin_evidence_at = _slot_from_anchor(consultation["generatedAt"], day_offset=1, hour=10, minute=20)
            tasks.append(
                {
                    "taskId": f"task-admin-{child_id}",
                    "taskType": "follow_up",
                    "childId": child_id,
                    "sourceType": "consultation",
                    "sourceId": consultation["consultationId"],
                    "ownerRole": "admin",
                    "title": f"{card['title']} 鍥暱澶嶆牳",
                    "description": consultation["whyHighPriority"],
                    "dueWindow": {"kind": "deadline", "label": "鍥暱澶嶆牳"},
                    "dueAt": consultation["directorDecisionCard"]["recommendedAt"],
                    "status": admin_state,
                    "evidenceSubmissionMode": "dispatch_status_update",
                    "createdAt": consultation["generatedAt"],
                    "updatedAt": admin_evidence_at if admin_state != "pending" else consultation["generatedAt"],
                    "statusChangedAt": admin_evidence_at if admin_state != "pending" else consultation["generatedAt"],
                    "completedAt": admin_evidence_at if admin_state == "completed" else None,
                    "lastEvidenceAt": admin_evidence_at if admin_state != "pending" else None,
                    "relatedTaskIds": [f"task-parent-{child_id}", f"task-followup-{child_id}"],
                    "legacyRefs": {
                        "consultationId": consultation["consultationId"],
                        "reminderIds": [f"reminder-admin-{consultation['consultationId']}"],
                    },
                }
            )
    return tasks


def _build_demo_reminders(
    consultations: list[dict[str, Any]],
    intervention_cards: list[dict[str, Any]],
    child_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    family_status = {"c-1": "done", "c-8": "acknowledged", "c-11": "acknowledged", "c-14": "acknowledged", "c-15": "pending"}
    teacher_status = {"c-1": "done", "c-8": "pending", "c-11": "pending", "c-14": "acknowledged", "c-15": "acknowledged"}
    admin_status = {"c-15": "pending", "c-14": "acknowledged", "c-8": "pending", "c-11": "pending"}
    reminders: list[dict[str, Any]] = []
    for card in intervention_cards:
        child = child_map.get(str(card["targetChildId"]), {})
        child_name = str(child.get("name") or "骞煎効")
        reminders.extend(
            [
                {
                    "reminderId": f"reminder-family-{card['id']}",
                    "reminderType": "family-task",
                    "targetRole": "parent",
                    "targetId": card["targetChildId"],
                    "childId": card["targetChildId"],
                    "title": f"{child_name} 浠婃櫄瀹跺涵璺熻繘",
                    "description": card["tonightHomeAction"],
                    "scheduledAt": _slot_from_anchor(card["createdAt"], hour=20, minute=30),
                    "status": family_status.get(str(card["targetChildId"]), "pending"),
                    "sourceId": card["id"],
                    "sourceType": "intervention_card",
                },
                {
                    "reminderId": f"reminder-review-{card['id']}",
                    "reminderType": "review-48h",
                    "targetRole": "teacher",
                    "targetId": card["targetChildId"],
                    "childId": card["targetChildId"],
                    "title": f"{child_name} 48 灏忔椂澶嶆牳",
                    "description": card["reviewIn48h"],
                    "scheduledAt": _slot_from_anchor(card["createdAt"], day_offset=2, hour=9, minute=30),
                    "status": teacher_status.get(str(card["targetChildId"]), "pending"),
                    "sourceId": card["id"],
                    "sourceType": "intervention_card",
                },
            ]
        )
    for consultation in consultations:
        if not consultation["shouldEscalateToAdmin"]:
            continue
        child = child_map.get(str(consultation["childId"]), {})
        child_name = str(child.get("name") or "骞煎効")
        reminders.append(
            {
                "reminderId": f"reminder-admin-{consultation['consultationId']}",
                "reminderType": "admin-focus",
                "targetRole": "admin",
                "targetId": consultation["childId"],
                "childId": consultation["childId"],
                "title": f"{child_name} 鍥暱璺熻繘",
                "description": consultation["whyHighPriority"],
                "scheduledAt": consultation["directorDecisionCard"]["recommendedAt"],
                "status": admin_status.get(str(consultation["childId"]), "pending"),
                "sourceId": consultation["consultationId"],
                "sourceType": "consultation",
            }
        )
    return reminders


def _build_demo_mobile_drafts_hotfix(
    consultations: list[dict[str, Any]],
    child_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    draft_specs: dict[str, dict[str, Any]] = {
        "c-8": {
            "transcript": "今天入园后提到想妈妈，午睡前哭闹约八分钟，安抚后才能躺下，需要补一条情绪与午睡过渡记录。",
            "warning": "router_low_confidence",
            "category": "EMOTION",
            "confidence": 0.46,
            "asrConfidence": 0.73,
            "suggestedAction": "补充哭闹持续时长、安抚方式和午睡后恢复情况。",
            "nextAction": "high-risk-consultation",
            "syncStatus": "local_pending",
        },
        "c-11": {
            "transcript": "午餐把青菜和胡萝卜挑出来，主食和蛋白接受度还可以，需要补蔬菜尝试量和家庭晚餐配合同步。",
            "category": "DIET",
            "confidence": 0.88,
            "asrConfidence": 0.92,
            "suggestedAction": "补充蔬菜尝试量、替代食材和家园同步口径。",
            "nextAction": "teacher-agent",
            "syncStatus": "synced",
        },
        "c-14": {
            "transcript": "午睡连续两天入睡偏慢，醒后情绪恢复也慢一点，需要保留睡眠复核草稿。",
            "warning": "detail_missing",
            "category": "SLEEP",
            "confidence": 0.58,
            "asrConfidence": 0.78,
            "suggestedAction": "补充午睡入睡时长、醒后情绪和昨晚入睡时间。",
            "nextAction": "teacher-agent",
            "syncStatus": "synced",
        },
        "c-15": {
            "transcript": "今天补水仍然依赖老师提醒，下午主动喝水偏少，适合补成补水趋势样本。",
            "category": "HEALTH",
            "confidence": 0.91,
            "asrConfidence": 0.95,
            "suggestedAction": "补下下午饮水刻度和晚间家庭补水反馈。",
            "nextAction": "teacher-agent",
            "syncStatus": "synced",
        },
    }
    drafts: list[dict[str, Any]] = []
    for index, consultation in enumerate(consultations):
        child_id = str(consultation.get("childId") or "").strip()
        spec = draft_specs.get(child_id)
        child = child_map.get(child_id)
        if spec is None or child is None:
            continue
        created_at = _slot_from_anchor(consultation["generatedAt"], hour=9 + index, minute=8 + index * 7)
        updated_at = _slot_from_anchor(created_at, hour=10 + index, minute=12 + index * 5)
        synced_at = updated_at if spec["syncStatus"] == "synced" else None
        warnings = [spec["warning"]] if spec.get("warning") else []
        drafts.append(
            {
                "draftId": f"demo-draft-{child_id}",
                "childId": child_id,
                "draftType": "voice",
                "targetRole": "teacher",
                "content": spec["transcript"],
                "structuredPayload": {
                    "kind": "teacher-voice-understanding",
                    "childName": child["name"],
                    "transcript": spec["transcript"],
                    "upload": {
                        "assetId": f"demo-audio-{child_id}",
                        "transcript": spec["transcript"],
                        "draftContent": spec["transcript"],
                        "provider": "demo-asr",
                        "source": "mock",
                        "status": "mocked",
                        "nextAction": spec["nextAction"],
                        "raw": {"source": "demo_snapshot"},
                    },
                    "understanding": {"meta": {"asr": {"confidence": spec["asrConfidence"]}}},
                    "understandingError": None,
                    "t5Seed": {
                        "transcript": spec["transcript"],
                        "router_result": {"route": "teacher_observation"},
                        "warnings": warnings,
                        "draft_items": [
                            {
                                "category": spec["category"],
                                "summary": consultation["summary"],
                                "structured_fields": {},
                                "confidence": spec["confidence"],
                                "suggested_actions": [spec["suggestedAction"]],
                                "raw_excerpt": consultation["triggerReason"],
                            }
                        ],
                    },
                    "t5State": {"version": 1, "records": []},
                },
                "syncStatus": spec["syncStatus"],
                "attachmentName": f"{child_id}-teacher-note.webm",
                "createdAt": created_at,
                "updatedAt": updated_at,
                "syncedAt": synced_at,
            }
        )
    return drafts


def _build_demo_task_check_ins_hotfix(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for task in tasks:
        if str(task.get("ownerRole") or "") not in {"teacher", "admin"}:
            continue
        if str(task.get("status") or "") not in {"in_progress", "completed"}:
            continue
        evidence_at = str(task.get("lastEvidenceAt") or task.get("completedAt") or task.get("updatedAt") or "").strip()
        if not evidence_at:
            continue
        records.append(
            {
                "id": f"checkin-{task['taskId']}",
                "childId": task["childId"],
                "taskId": task["taskId"],
                "date": evidence_at[:10],
            }
        )
    return records


def _link_feedback_records_hotfix(
    feedback_records: list[dict[str, Any]],
    intervention_cards: list[dict[str, Any]],
    consultations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    card_by_child = {str(card.get("targetChildId") or ""): card for card in intervention_cards}
    consultation_by_child = {str(item.get("childId") or ""): item for item in consultations}
    linked_child_ids: set[str] = set()
    records: list[dict[str, Any]] = []
    for feedback in feedback_records:
        next_record = copy.deepcopy(feedback)
        child_id = str(next_record.get("childId") or "").strip()
        next_record["submittedAt"] = next_record.get("submittedAt") or _feedback_submitted_at(next_record)
        if child_id in DEMO_HERO_CHILD_IDS and child_id not in linked_child_ids:
            intervention_card = card_by_child.get(child_id)
            consultation = consultation_by_child.get(child_id)
            if intervention_card and consultation:
                next_record["interventionCardId"] = intervention_card["id"]
                next_record["relatedConsultationId"] = consultation["consultationId"]
                next_record["sourceWorkflow"] = "consultation_follow_up"
                linked_child_ids.add(child_id)
        records.append(next_record)
    return records


def _sort_records_hotfix(snapshot: dict[str, Any]) -> None:
    for key, field_name in (("attendance", "date"), ("meals", "date"), ("health", "date"), ("taskCheckIns", "date")):
        snapshot.setdefault(key, []).sort(key=lambda item: item.get(field_name, ""), reverse=True)
    snapshot.setdefault("feedback", []).sort(
        key=lambda item: (item.get("submittedAt", ""), item.get("date", "")),
        reverse=True,
    )
    snapshot.setdefault("growth", []).sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    snapshot.setdefault("consultations", []).sort(key=lambda item: item.get("generatedAt", ""), reverse=True)
    snapshot.setdefault("interventionCards", []).sort(
        key=lambda item: (item.get("updatedAt", ""), item.get("createdAt", "")),
        reverse=True,
    )
    snapshot.setdefault("mobileDrafts", []).sort(
        key=lambda item: (item.get("updatedAt", ""), item.get("createdAt", "")),
        reverse=True,
    )
    snapshot.setdefault("reminders", []).sort(key=lambda item: item.get("scheduledAt", ""), reverse=True)
    snapshot.setdefault("tasks", []).sort(
        key=lambda item: (item.get("dueAt", ""), item.get("updatedAt", ""), item.get("createdAt", "")),
        reverse=True,
    )


def _pick_child_hotfix(snapshot: dict[str, Any], child_id: str | None) -> dict[str, Any]:
    normalized_id = (child_id or "").strip()
    children = [item for item in snapshot.get("children", []) if isinstance(item, dict)]
    if normalized_id:
        for child in children:
            if child.get("id") == normalized_id:
                return copy.deepcopy(child)
    for preferred_id in (
        DEFAULT_PRIORITY_CHILD_ID,
        DEFAULT_HIGH_RISK_CHILD_ID,
        DEFAULT_HYDRATION_CHILD_ID,
        DEMO_POSITIVE_CHILD_ID,
    ):
        for child in children:
            if child.get("id") == preferred_id:
                return copy.deepcopy(child)
    return copy.deepcopy(children[0]) if children else {}


def _overview_hotfix(snapshot: dict[str, Any], now: datetime) -> dict[str, Any]:
    children = [item for item in snapshot.get("children", []) if isinstance(item, dict)]
    attendance = [item for item in snapshot.get("attendance", []) if isinstance(item, dict)]
    health = [item for item in snapshot.get("health", []) if isinstance(item, dict)]
    growth = [item for item in snapshot.get("growth", []) if isinstance(item, dict)]
    feedback = [item for item in snapshot.get("feedback", []) if isinstance(item, dict)]
    consultations = [item for item in snapshot.get("consultations", []) if isinstance(item, dict)]
    child_map = {str(child.get("id") or ""): child for child in children}
    today = _date_text(now, 0)
    today_present_ids = {
        str(item.get("childId") or "")
        for item in attendance
        if item.get("date") == today and item.get("status") in {"present", "late"}
    }
    attended_total = sum(1 for item in attendance if item.get("status") in {"present", "late"})
    feedback_child_ids = {str(item.get("childId") or "") for item in feedback if str(item.get("childId") or "").strip()}
    risk_children = [
        item
        for item in consultations
        if bool(item.get("shouldEscalateToAdmin")) or str(item.get("riskLevel") or "") in {"high", "medium"}
    ]
    risk_child_ids = {str(item.get("childId") or "") for item in risk_children if str(item.get("childId") or "").strip()}
    risk_class_ids = {
        str(child_map[child_id].get("className") or "")
        for child_id in risk_child_ids
        if child_id in child_map and str(child_map[child_id].get("className") or "").strip()
    }
    attendance_trend = []
    for days_ago in sorted(ATTENDANCE_DAYS, reverse=True):
        date_text = _date_text(now, days_ago)
        present_count = sum(
            1
            for item in attendance
            if item.get("date") == date_text and item.get("status") in {"present", "late"}
        )
        attendance_trend.append({"date": date_text, "presentCount": present_count})
    risk_by_class: list[dict[str, Any]] = []
    for class_name in sorted(risk_class_ids):
        risk_by_class.append(
            {
                "className": class_name,
                "count": sum(
                    1
                    for child_id in risk_child_ids
                    if str(child_map.get(child_id, {}).get("className") or "") == class_name
                ),
            }
        )
    return {
        "visibleChildren": len(children),
        "classCount": len({str(child.get("className") or "") for child in children if str(child.get("className") or "").strip()}),
        "todayPresentCount": len(today_present_ids),
        "todayAttendanceRate": round(len(today_present_ids) * 100 / max(len(children), 1)),
        "attendanceRate": round(attended_total * 100 / max(len(attendance), 1)),
        "healthAbnormalCount": len({str(item.get("childId") or "") for item in health if item.get("isAbnormal")}),
        "growthAttentionCount": len({str(item.get("childId") or "") for item in growth if item.get("needsAttention")}),
        "pendingReviewCount": len(
            {
                str(item.get("childId") or "")
                for item in growth
                if str(item.get("reviewStatus") or "").strip() and str(item.get("reviewStatus") or "").strip() != "已完成"
            }
        ),
        "feedbackCount": len(feedback_child_ids),
        "feedbackCompletionRate": round(len(feedback_child_ids) * 100 / max(len(children), 1)),
        "riskChildrenCount": len(risk_child_ids),
        "riskClassCount": len(risk_class_ids),
        "attendanceTrend": attendance_trend,
        "riskByClass": risk_by_class,
        "heroChildIds": list(DEMO_HERO_CHILD_IDS),
    }


def _summary_hotfix(snapshot: dict[str, Any], selected_child_id: str | None, now: datetime) -> dict[str, Any]:
    children = [item for item in snapshot.get("children", []) if isinstance(item, dict)]
    child_map = {str(child.get("id") or ""): child for child in children}
    meals = [item for item in snapshot.get("meals", []) if isinstance(item, dict)]
    feedback = [item for item in snapshot.get("feedback", []) if isinstance(item, dict)]
    overview = _overview_hotfix(snapshot, now)
    hero_children_with_allergy = {
        child_id
        for child_id in DEMO_HERO_CHILD_IDS
        if child_id in child_map and child_map[child_id].get("allergies")
    }
    meal_child_ids = {str(item.get("childId") or "") for item in meals if str(item.get("childId") or "").strip()}
    allergy_risk_count = len(hero_children_with_allergy & meal_child_ids)
    picky_count = len(
        {
            str(item.get("childId") or "")
            for item in meals
            if item.get("preference") == "dislike" or item.get("intakeLevel") == "low"
        }
    )
    hydration_low_count = len(
        {str(item.get("childId") or "") for item in meals if int(item.get("waterMl") or 0) < 120}
    )
    feedback_count = len({str(item.get("childId") or "") for item in feedback if str(item.get("childId") or "").strip()})
    selected_id = (selected_child_id or "").strip()
    return {
        "health": {"abnormalCount": overview["healthAbnormalCount"]},
        "growth": {
            "attentionCount": overview["growthAttentionCount"],
            "pendingReviewCount": overview["pendingReviewCount"],
        },
        "meals": {
            "allergyRiskCount": allergy_risk_count,
            "pickyCount": picky_count,
            "hydrationLowCount": hydration_low_count,
        },
        "feedback": {
            "count": feedback_count,
            "gapCount": max(len(children) - feedback_count, 0),
            "completionRate": overview["feedbackCompletionRate"],
        },
        "priorityChildId": DEFAULT_PRIORITY_CHILD_ID,
        "highlights": [
            "向阳班与晨曦班同时覆盖风险样本，适合 Admin 首屏与 weekly-report 讲解。",
            "c-1 保留家长闭环，c-3 提供正向成长对照，避免画面只有风险案例。",
            "会诊、干预、提醒、任务与家长反馈已经对齐到同一条 demo 叙事链。",
        ],
        "escalationCandidates": sorted(ESCALATION_CANDIDATE_IDS),
        "selectedChildId": selected_id,
        "snapshotWindow": {"from": _date_text(now, 14), "to": _date_text(now, 0)},
    }


def _build_demo_snapshot_hotfix(now: datetime | None = None) -> dict[str, Any]:
    current = _resolve_now(now)
    children = _build_children()
    child_map = {child["id"]: child for child in children}
    snapshot: dict[str, Any] = {key: [] for key in DEFAULT_SNAPSHOT_KEYS}
    snapshot["children"] = children
    snapshot["updatedAt"] = current.isoformat()
    for child in children:
        attendance_records = _build_attendance_records(child, current)
        tracked_dates = {item["date"] for item in attendance_records}
        present_dates = {
            item["date"]
            for item in attendance_records
            if item.get("status") in {"present", "late"}
        }
        snapshot["attendance"].extend(attendance_records)
        snapshot["meals"].extend(
            [
                item
                for item in _build_meal_records(child, current)
                if item.get("date") not in tracked_dates or item.get("date") in present_dates
            ]
        )
        snapshot["health"].extend(
            [
                item
                for item in _build_health_records(child, current)
                if item.get("date") not in tracked_dates or item.get("date") in present_dates
            ]
        )
        snapshot["growth"].extend(
            [
                item
                for item in _build_growth_records(child, current)
                if str(item.get("createdAt", ""))[:10] not in tracked_dates
                or str(item.get("createdAt", ""))[:10] in present_dates
            ]
        )
        snapshot["feedback"].extend(_build_feedback_records(child, current))
    consultations = _build_demo_consultation_results(current)
    intervention_cards = _build_demo_intervention_cards(consultations, child_map)
    feedback_records = _link_feedback_records_hotfix(snapshot["feedback"], intervention_cards, consultations)
    tasks = _build_demo_tasks(consultations, intervention_cards, feedback_records)
    snapshot["feedback"] = feedback_records
    snapshot["consultations"] = consultations
    snapshot["interventionCards"] = intervention_cards
    snapshot["tasks"] = tasks
    snapshot["taskCheckIns"] = _build_demo_task_check_ins_hotfix(tasks)
    snapshot["reminders"] = _build_demo_reminders(consultations, intervention_cards, child_map)
    snapshot["mobileDrafts"] = _build_demo_mobile_drafts_hotfix(consultations, child_map)
    _sort_records_hotfix(snapshot)
    return snapshot


def _build_demo_consultation_feed_items_hotfix(
    now: datetime | None = None,
    *,
    limit: int | None = 4,
    include_parent_mainline: bool = False,
) -> list[dict[str, Any]]:
    current = _resolve_now(now)
    feed_items = [_build_demo_consultation_feed_item(item) for item in _build_demo_consultation_results(current)]
    if not include_parent_mainline:
        feed_items = [item for item in feed_items if item.get("shouldEscalateToAdmin")]
    risk_rank = {"high": 0, "medium": 1, "low": 2}
    feed_items.sort(
        key=lambda item: (
            risk_rank.get(str(item.get("riskLevel") or "low"), 9),
            -_parse_demo_datetime(item.get("generatedAt")).timestamp()
            if _parse_demo_datetime(item.get("generatedAt"))
            else 0,
        )
    )
    if limit is None:
        return feed_items
    return feed_items[:limit]


def _build_demo_weekly_snapshot_hotfix(*, target_child_id: str | None = None, now: datetime | None = None) -> dict[str, Any]:
    current = _resolve_now(now)
    snapshot = _build_demo_snapshot_hotfix(current)
    selected = _pick_child_hotfix(snapshot, target_child_id or DEFAULT_PRIORITY_CHILD_ID)
    child_map = {str(child.get("id") or ""): child for child in snapshot.get("children", []) if isinstance(child, dict)}
    consultation_feed = _build_demo_consultation_feed_items_hotfix(current, limit=4)
    risk_children: list[dict[str, Any]] = []
    risk_classes: list[dict[str, Any]] = []
    seen_classes: set[str] = set()
    for item in consultation_feed:
        child = child_map.get(str(item.get("childId") or ""), {})
        class_name = str(child.get("className") or "").strip()
        risk_children.append(
            {
                "childId": item.get("childId"),
                "childName": child.get("name"),
                "reason": item.get("triggerReason"),
                "riskLevel": item.get("riskLevel"),
                "className": class_name,
            }
        )
        if class_name and class_name not in seen_classes:
            seen_classes.add(class_name)
            risk_classes.append({"className": class_name, "reason": item.get("triggerReason")})
    return {
        "institutionName": INSTITUTION_NAME,
        "institutionId": INSTITUTION_ID,
        "periodLabel": DEFAULT_PERIOD_LABEL,
        "overview": _overview_hotfix(snapshot, current),
        "summary": _summary_hotfix(snapshot, selected.get("id"), current),
        "child": _child_list_item(selected) if selected else {},
        "updatedAt": snapshot["updatedAt"],
        "topConsultations": consultation_feed,
        "riskChildren": risk_children,
        "riskClasses": risk_classes,
        "heroChildIds": list(DEMO_HERO_CHILD_IDS),
    }


def _build_demo_child_service_payload_hotfix(
    *,
    target_child_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    current = _resolve_now(now)
    snapshot = _build_demo_snapshot_hotfix(current)
    selected = _pick_child_hotfix(snapshot, target_child_id or DEFAULT_HIGH_RISK_CHILD_ID)
    selected_id = selected.get("id", DEFAULT_HIGH_RISK_CHILD_ID)
    return {
        "targetChildId": selected_id,
        "visibleChildren": _class_visible_children(snapshot, selected_id),
        "presentChildren": _present_children(snapshot, selected_id, current),
        "healthCheckRecords": [copy.deepcopy(item) for item in snapshot["health"] if item.get("childId") == selected_id],
        "growthRecords": [copy.deepcopy(item) for item in snapshot["growth"] if item.get("childId") == selected_id],
        "guardianFeedbacks": [copy.deepcopy(item) for item in snapshot["feedback"] if item.get("childId") == selected_id],
        "currentUser": {
            "id": "teacher-demo",
            "name": "演示老师",
            "className": selected.get("className") or "向阳班",
            "institutionId": INSTITUTION_ID,
            "institutionName": INSTITUTION_NAME,
        },
        "snapshot": _build_demo_weekly_snapshot_hotfix(target_child_id=selected_id, now=current),
    }


def _build_demo_admin_payload_hotfix(now: datetime | None = None) -> dict[str, Any]:
    current = _resolve_now(now)
    snapshot = _build_demo_snapshot_hotfix(current)
    children = [_child_list_item(child) for child in snapshot["children"]]
    ordered_children = _ordered_selected_first(children, DEFAULT_PRIORITY_CHILD_ID)
    return {
        "visibleChildren": ordered_children,
        "guardianFeedbacks": copy.deepcopy(snapshot["feedback"]),
        "currentUser": {
            "id": "admin-demo",
            "name": "演示园长",
            "institutionId": INSTITUTION_ID,
            "institutionName": INSTITUTION_NAME,
        },
        "snapshot": _build_demo_weekly_snapshot_hotfix(target_child_id=DEFAULT_PRIORITY_CHILD_ID, now=current),
        "consultations": _build_demo_consultation_feed_items_hotfix(current, limit=4),
    }

def _sort_records(snapshot: dict[str, Any]) -> None:
    return _sort_records_hotfix(snapshot)
    for key, field_name in (("attendance", "date"), ("meals", "date"), ("health", "date"), ("feedback", "date")):
        snapshot[key].sort(key=lambda item: item.get(field_name, ""), reverse=True)
    snapshot["growth"].sort(key=lambda item: item.get("createdAt", ""), reverse=True)


def build_demo_snapshot(now: datetime | None = None) -> dict[str, Any]:
    return _build_demo_snapshot_hotfix(now)
    current = _resolve_now(now)
    children = _build_children()
    snapshot: dict[str, Any] = {key: [] for key in DEFAULT_SNAPSHOT_KEYS}
    snapshot["children"] = children
    snapshot["updatedAt"] = current.isoformat()

    for child in children:
        attendance_records = _build_attendance_records(child, current)
        tracked_dates = {item["date"] for item in attendance_records}
        present_dates = {
            item["date"]
            for item in attendance_records
            if item.get("status") in {"present", "late"}
        }
        snapshot["attendance"].extend(attendance_records)
        snapshot["meals"].extend(
            [
                item
                for item in _build_meal_records(child, current)
                if item.get("date") not in tracked_dates or item.get("date") in present_dates
            ]
        )
        snapshot["health"].extend(
            [
                item
                for item in _build_health_records(child, current)
                if item.get("date") not in tracked_dates or item.get("date") in present_dates
            ]
        )
        snapshot["growth"].extend(
            [
                item
                for item in _build_growth_records(child, current)
                if str(item.get("createdAt", ""))[:10] not in tracked_dates
                or str(item.get("createdAt", ""))[:10] in present_dates
            ]
        )
        snapshot["feedback"].extend(_build_feedback_records(child, current))

    snapshot["consultations"] = build_demo_consultation_feed_items(current)
    _sort_records(snapshot)
    return snapshot


def _pick_child(snapshot: dict[str, Any], child_id: str | None) -> dict[str, Any]:
    return _pick_child_hotfix(snapshot, child_id)
    normalized_id = (child_id or "").strip()
    children = [item for item in snapshot.get("children", []) if isinstance(item, dict)]
    if normalized_id:
        for child in children:
            if child.get("id") == normalized_id:
                return copy.deepcopy(child)
    for preferred_id in (DEFAULT_HIGH_RISK_CHILD_ID, DEFAULT_HYDRATION_CHILD_ID, DEFAULT_PRIORITY_CHILD_ID):
        for child in children:
            if child.get("id") == preferred_id:
                return copy.deepcopy(child)
    return copy.deepcopy(children[0]) if children else {}


def _class_visible_children(snapshot: dict[str, Any], selected_child_id: str) -> list[dict[str, Any]]:
    selected = _pick_child(snapshot, selected_child_id)
    class_name = selected.get("className")
    classmates = [_child_list_item(child) for child in snapshot.get("children", []) if child.get("className") == class_name]
    return _ordered_selected_first(classmates, selected_child_id)


def _present_children(snapshot: dict[str, Any], selected_child_id: str, now: datetime) -> list[dict[str, Any]]:
    today = _date_text(now, 0)
    present_ids = {
        item.get("childId")
        for item in snapshot.get("attendance", [])
        if item.get("date") == today and item.get("status") in {"present", "late"}
    }
    visible = _class_visible_children(snapshot, selected_child_id)
    return [item for item in visible if item.get("id") in present_ids]


def _overview() -> dict[str, Any]:
    return _overview_hotfix(_build_demo_snapshot_hotfix(), _resolve_now())
    feedback_children = len(CHILD_SEEDS) - len(NO_FEEDBACK_IDS)
    today_present_count = len(CHILD_SEEDS) - len(TODAY_ABSENT_CHILD_NUMBERS)
    return {
        "visibleChildren": len(CHILD_SEEDS),
        "classCount": 2,
        "todayPresentCount": today_present_count,
        "todayAttendanceRate": round(today_present_count * 100 / len(CHILD_SEEDS)),
        "attendanceRate": 84,
        "healthAbnormalCount": len(HEALTH_ABNORMAL_IDS),
        "growthAttentionCount": len(GROWTH_ATTENTION_IDS),
        "pendingReviewCount": len(PENDING_REVIEW_IDS),
        "feedbackCount": feedback_children,
        "feedbackCompletionRate": round(feedback_children * 100 / len(CHILD_SEEDS)),
        "riskChildrenCount": len(ESCALATION_CANDIDATE_IDS),
        "riskClassCount": 2,
    }


def _summary(selected_child_id: str | None) -> dict[str, Any]:
    return _summary_hotfix(_build_demo_snapshot_hotfix(), selected_child_id, _resolve_now())
    return {
        "health": {"abnormalCount": len(HEALTH_ABNORMAL_IDS)},
        "growth": {
            "attentionCount": len(GROWTH_ATTENTION_IDS),
            "pendingReviewCount": len(PENDING_REVIEW_IDS),
        },
        "meals": {
            "allergyRiskCount": 3,
            "pickyCount": len(PICKY_OR_HYDRATION_IDS),
            "hydrationLowCount": len(PICKY_OR_HYDRATION_IDS),
        },
        "feedback": {
            "count": len(CHILD_SEEDS) - len(NO_FEEDBACK_IDS),
            "gapCount": len(FEEDBACK_GAP_IDS),
            "completionRate": _overview()["feedbackCompletionRate"],
        },
        "priorityChildId": DEFAULT_PRIORITY_CHILD_ID,
        "highlights": [
            "正向亮点与高风险样本并存，适合周报和家长侧录屏。",
            "重点样本可覆盖健康、饮食、成长、反馈与待复查链路。",
        ],
        "escalationCandidates": sorted(ESCALATION_CANDIDATE_IDS),
        "selectedChildId": (selected_child_id or "").strip(),
    }


def build_demo_weekly_snapshot(*, target_child_id: str | None = None, now: datetime | None = None) -> dict[str, Any]:
    return _build_demo_weekly_snapshot_hotfix(target_child_id=target_child_id, now=now)
    current = _resolve_now(now)
    snapshot = build_demo_snapshot(current)
    selected = _pick_child(snapshot, target_child_id or DEFAULT_PRIORITY_CHILD_ID)
    return {
        "institutionName": INSTITUTION_NAME,
        "institutionId": INSTITUTION_ID,
        "periodLabel": DEFAULT_PERIOD_LABEL,
        "overview": _overview(),
        "summary": _summary(selected.get("id")),
        "child": _child_list_item(selected) if selected else {},
        "updatedAt": snapshot["updatedAt"],
    }


def build_demo_child_service_payload(*, target_child_id: str | None = None, now: datetime | None = None) -> dict[str, Any]:
    return _build_demo_child_service_payload_hotfix(target_child_id=target_child_id, now=now)
    current = _resolve_now(now)
    snapshot = build_demo_snapshot(current)
    selected = _pick_child(snapshot, target_child_id or DEFAULT_HIGH_RISK_CHILD_ID)
    selected_id = selected.get("id", DEFAULT_HIGH_RISK_CHILD_ID)
    return {
        "targetChildId": selected_id,
        "visibleChildren": _class_visible_children(snapshot, selected_id),
        "presentChildren": _present_children(snapshot, selected_id, current),
        "healthCheckRecords": [copy.deepcopy(item) for item in snapshot["health"] if item.get("childId") == selected_id],
        "growthRecords": [copy.deepcopy(item) for item in snapshot["growth"] if item.get("childId") == selected_id],
        "guardianFeedbacks": [copy.deepcopy(item) for item in snapshot["feedback"] if item.get("childId") == selected_id],
        "currentUser": {
            "id": "teacher-demo",
            "name": "演示老师",
            "className": selected.get("className") or "向阳班",
            "institutionId": INSTITUTION_ID,
            "institutionName": INSTITUTION_NAME,
        },
        "snapshot": build_demo_weekly_snapshot(target_child_id=selected_id, now=current),
    }


def build_demo_admin_payload(now: datetime | None = None) -> dict[str, Any]:
    return _build_demo_admin_payload_hotfix(now)
    current = _resolve_now(now)
    snapshot = build_demo_snapshot(current)
    children = [_child_list_item(child) for child in snapshot["children"]]
    ordered_children = _ordered_selected_first(children, DEFAULT_PRIORITY_CHILD_ID)
    return {
        "visibleChildren": ordered_children,
        "guardianFeedbacks": copy.deepcopy(snapshot["feedback"]),
        "currentUser": {
            "id": "admin-demo",
            "name": "园长王老师",
            "institutionId": INSTITUTION_ID,
            "institutionName": INSTITUTION_NAME,
        },
        "snapshot": build_demo_weekly_snapshot(target_child_id=DEFAULT_PRIORITY_CHILD_ID, now=current),
    }


def build_demo_consultation_feed_items(
    now: datetime | None = None,
    *,
    limit: int | None = 4,
    include_parent_mainline: bool = False,
) -> list[dict[str, Any]]:
    return _build_demo_consultation_feed_items_hotfix(
        now,
        limit=limit,
        include_parent_mainline=include_parent_mainline,
    )
    current = _resolve_now(now)
    child_map = {child["id"]: child for child in _build_children()}
    specs = [
        {
            "childId": "c-16",
            "daysAgo": 0,
            "riskLevel": "high",
            "status": "pending",
            "ownerRole": "admin",
            "ownerName": "园长王老师",
            "triggerReason": "环境变化后的情绪崩溃仍在反复",
            "summary": "情绪敏感样本仍需高风险闭环，建议优先保留安抚流程并同步家庭回传。",
            "shouldEscalate": True,
        },
        {
            "childId": "c-15",
            "daysAgo": 1,
            "riskLevel": "high",
            "status": "pending",
            "ownerRole": "teacher",
            "ownerName": "班级老师",
            "triggerReason": "补水持续偏低并叠加过敏饮食避让",
            "summary": "饮水偏低样本需要继续日内补水记录，并约定晚间家庭补水反馈。",
            "shouldEscalate": True,
        },
        {
            "childId": "c-14",
            "daysAgo": 1,
            "riskLevel": "high",
            "status": "in_progress",
            "ownerRole": "teacher",
            "ownerName": "班级老师",
            "triggerReason": "午睡和晚间作息波动仍未完全稳定",
            "summary": "睡眠待复查样本需要保留 48 小时复查点，避免过早下结论。",
            "shouldEscalate": True,
        },
        {
            "childId": "c-8",
            "daysAgo": 1,
            "riskLevel": "medium",
            "status": "pending",
            "ownerRole": "teacher",
            "ownerName": "班级老师",
            "triggerReason": "午睡前分离焦虑与家庭反馈缺口叠加",
            "summary": "午睡分离焦虑样本适合继续用园内记录加家庭反馈形成闭环。",
            "shouldEscalate": True,
        },
    ]
    items: list[dict[str, Any]] = []
    for spec in specs:
        child = child_map[spec["childId"]]
        generated_at = _datetime_text(current, spec["daysAgo"], hour=17, minute=20)
        director_card = {
            "title": "园长决策卡",
            "reason": spec["triggerReason"],
            "recommendedOwnerRole": spec["ownerRole"],
            "recommendedOwnerName": spec["ownerName"],
            "recommendedAt": "today" if spec["daysAgo"] == 0 else _date_text(current, spec["daysAgo"]),
            "status": spec["status"],
        }
        items.append(
            {
                "consultationId": f"consultation-{spec['childId']}",
                "childId": spec["childId"],
                "generatedAt": generated_at,
                "riskLevel": spec["riskLevel"],
                "triggerReason": spec["triggerReason"],
                "triggerReasons": [spec["triggerReason"], f"{child['name']} 的园内观察与家庭反馈需要继续闭环。"],
                "summary": spec["summary"],
                "directorDecisionCard": director_card,
                "status": spec["status"],
                "ownerName": spec["ownerName"],
                "ownerRole": spec["ownerRole"],
                "dueAt": director_card["recommendedAt"],
                "whyHighPriority": spec["triggerReason"],
                "todayInSchoolActions": ["补齐当日关键观察记录。", "同步班级老师执行结果。"],
                "tonightAtHomeActions": ["今晚反馈孩子情绪与进食变化。", "如有异常波动，明早继续回传。"],
                "followUp48h": ["48 小时内复查执行结果，并决定是否继续升级。"],
                "syncTargets": ["教师端结果卡", "家长端今晚任务", *([] if not spec["shouldEscalate"] else ["园长端决策卡"])],
                "shouldEscalateToAdmin": spec["shouldEscalate"],
                "evidenceItems": [
                    {
                        "id": f"ce:consultation-{spec['childId']}:consultation_history:demo:0",
                        "sourceType": "consultation_history",
                        "sourceLabel": "演示连续性说明",
                        "sourceId": f"demo-history-{spec['childId']}",
                        "summary": spec["triggerReason"],
                        "confidence": "medium",
                        "requiresHumanReview": False,
                        "evidenceCategory": "risk_control",
                        "supports": [
                            {
                                "type": "finding",
                                "targetId": "finding:key:0",
                                "targetLabel": spec["triggerReason"],
                            }
                        ],
                        "metadata": {
                            "sourceField": "demo_snapshot",
                            "provenance": {"provider": "mock-brain", "source": "mock"},
                        },
                    },
                    {
                        "id": f"ce:consultation-{spec['childId']}:derived_explainability:demo:1",
                        "sourceType": "derived_explainability",
                        "sourceLabel": "演示协调结论",
                        "sourceId": "explainability:0",
                        "summary": spec["summary"],
                        "confidence": "low",
                        "requiresHumanReview": True,
                        "evidenceCategory": "development_support",
                        "supports": [
                            {
                                "type": "action",
                                "targetId": "action:followup:0",
                                "targetLabel": "48 灏忔椂鍐呭鏌ユ墽琛岀粨鏋滐紝骞跺喅瀹氭槸鍚︾户缁崌绾с€?",
                            }
                        ],
                        "metadata": {
                            "sourceField": "demo_snapshot",
                            "provenance": {"provider": "mock-brain", "source": "mock"},
                        },
                    },
                ],
                "explainabilitySummary": {
                    "agentParticipants": ["健康观察", "饮食行为", "家园协同", "协调器"],
                    "keyFindings": [spec["triggerReason"], "需要把园内动作和家庭反馈接成一条线。"],
                    "coordinationConclusion": spec["summary"],
                    "evidenceHighlights": [f"child: {child['name']}", f"class: {child['className']}"],
                },
                "providerTraceSummary": {
                    "traceId": f"demo-trace-{spec['childId']}",
                    "status": "fallback",
                    "provider": "mock-brain",
                    "source": "mock",
                    "model": "mock-high-risk-v1",
                    "transport": "fastapi-brain",
                    "transportSource": "fastapi-brain",
                    "consultationSource": "demo-fallback",
                    "fallbackReason": "demo-snapshot",
                    "brainProvider": "mock",
                    "realProvider": False,
                    "fallback": True,
                },
                "memoryMetaSummary": {
                    "backend": "demo_snapshot",
                    "degraded": False,
                    "usedSources": ["demo_snapshot"],
                    "errors": [],
                    "matchedSnapshotIds": [],
                    "matchedTraceIds": [],
                },
            }
        )
    return items
