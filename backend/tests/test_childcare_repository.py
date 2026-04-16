from __future__ import annotations

import asyncio

from app.db.childcare_repository import ChildcareRepository


def build_app_snapshot() -> dict:
    return {
        "children": [
            {
                "id": "c-11",
                "name": "Zhou Shiyu",
                "nickname": "Shishi",
                "birthDate": "2025-06-01",
                "institutionId": "inst-test",
                "className": "Sunflower Class",
            }
        ],
        "attendance": [],
        "meals": [
            {
                "id": "meal-1",
                "childId": "c-11",
                "date": "2026-04-03",
                "meal": "lunch",
                "foods": ["rice", "greens", "chicken"],
                "intakeLevel": "low",
                "preference": "dislike",
                "waterMl": 120,
                "nutritionScore": 66,
                "aiEvaluation": {"summary": "Mostly ate the chicken and left the vegetables."},
            }
        ],
        "growth": [],
        "feedback": [],
        "health": [],
        "taskCheckIns": [],
        "interventionCards": [],
        "consultations": [],
        "mobileDrafts": [],
        "reminders": [],
        "updatedAt": "2026-04-04T00:00:00Z",
    }


def test_childcare_repository_request_snapshot_supports_real_request_scoped_writes():
    repository = asyncio.run(
        ChildcareRepository.create(app_snapshot=build_app_snapshot(), institution_id=None, database_url=None)
    )

    observation_result = asyncio.run(
        repository.insert_observation(
            child_id="c-11",
            observation_type="diet_follow_up",
            content="Lunch still showed clear vegetable avoidance and needs teacher follow-up.",
            metadata={"tags": ["diet", "picky"], "category": "daily-observation"},
        )
    )
    draft_result = asyncio.run(
        repository.write_draft_record(
            child_id="c-11",
            draft_type="observation",
            target_role="teacher",
            content="Keep tracking diet continuity over the next 7 days.",
            structured_payload={"trendDetected": True},
        )
    )

    assert repository.source == "request_snapshot"
    assert observation_result["record"]["description"] == (
        "Lunch still showed clear vegetable avoidance and needs teacher follow-up."
    )
    assert observation_result["persisted"] is False
    assert repository.snapshot["growth"][0]["childId"] == "c-11"
    assert draft_result["record"]["content"] == "Keep tracking diet continuity over the next 7 days."
    assert draft_result["persisted"] is False
    assert repository.snapshot["mobileDrafts"][0]["childId"] == "c-11"


def test_childcare_repository_request_snapshot_history_anchors_to_snapshot_updated_at():
    snapshot = build_app_snapshot()
    snapshot["meals"].extend(
        [
            {
                "id": "meal-2",
                "childId": "c-11",
                "date": "2026-04-02",
                "meal": "lunch",
                "foods": ["rice", "greens", "chicken"],
                "intakeLevel": "medium",
                "preference": "neutral",
                "waterMl": 140,
                "nutritionScore": 72,
            },
            {
                "id": "meal-3",
                "childId": "c-11",
                "date": "2026-03-30",
                "meal": "lunch",
                "foods": ["rice", "pumpkin", "egg"],
                "intakeLevel": "medium",
                "preference": "neutral",
                "waterMl": 130,
                "nutritionScore": 70,
            },
        ]
    )

    repository = asyncio.run(ChildcareRepository.create(app_snapshot=snapshot, institution_id=None, database_url=None))

    history = repository.get_child_history("c-11", 7)

    assert history["aggregates"]["mealCount"] == 3
    assert [record["id"] for record in history["meals"]] == ["meal-1", "meal-2", "meal-3"]


def test_childcare_repository_child_summary_adds_age_band_metadata_without_breaking_legacy_keys():
    repository = asyncio.run(
        ChildcareRepository.create(app_snapshot=build_app_snapshot(), institution_id=None, database_url=None)
    )

    child = repository.get_child_by_id("c-11")
    summary = repository.child_summary(child)

    assert summary["childId"] == "c-11"
    assert summary["name"] == "Zhou Shiyu"
    assert summary["nickname"] == "Shishi"
    assert summary["className"] == "Sunflower Class"
    assert summary["institutionId"] == "inst-test"
    assert summary["birthDate"] == "2025-06-01"
    assert summary["ageBand"] is None
    assert summary["normalizedAgeBand"] == "0-12m"
    assert summary["ageBandSource"] == "birthDate"


def test_childcare_repository_demo_snapshot_expands_to_36_children_and_recent_histories():
    repository = asyncio.run(ChildcareRepository.create(app_snapshot=None, institution_id=None, database_url=None))

    child_ids = {child["id"] for child in repository.snapshot["children"]}
    assert repository.source == "demo_snapshot"
    assert repository.fallback is True
    assert len(repository.snapshot["children"]) == 36
    assert len(child_ids) == 36
    assert repository.get_child_by_id("c-16")["name"]

    for bucket in ("attendance", "meals", "growth", "feedback", "health"):
        bucket_child_ids = {record["childId"] for record in repository.snapshot[bucket]}
        assert bucket_child_ids <= child_ids

    c8_history = repository.get_child_history("c-8", 14)
    c11_history = repository.get_child_history("c-11", 7)
    c15_history = repository.get_child_history("c-15", 7)

    assert c8_history["aggregates"]["observationCount"] >= 2
    assert c8_history["aggregates"]["feedbackCount"] >= 1
    assert c11_history["aggregates"]["mealCount"] >= 3
    assert c11_history["aggregates"]["pickyEatingSignals"] >= 1
    assert c15_history["aggregates"]["mealCount"] >= 3
    assert any(record["isAbnormal"] for record in c15_history["health"])


def test_childcare_repository_normalizes_structured_feedback_into_history_and_timeline():
    snapshot = build_app_snapshot()
    snapshot["feedback"] = [
        {
            "feedbackId": "fb-structured-1",
            "childId": "c-11",
            "sourceRole": "parent",
            "sourceChannel": "manual",
            "relatedTaskId": "task-parent-1",
            "relatedConsultationId": "consult-1",
            "executionStatus": "unable_to_execute",
            "executionCount": 1,
            "executorRole": "parent",
            "childReaction": "resisted",
            "improvementStatus": "worse",
            "barriers": ["Child had a fever"],
            "notes": "The family could not execute the hydration step tonight.",
            "attachments": {},
            "submittedAt": "2026-04-04T08:30:00Z",
            "source": {"kind": "structured", "workflow": "manual"},
            "fallback": {},
            "createdBy": "Parent Chen",
            "createdByRole": "parent",
        }
    ]

    repository = asyncio.run(
        ChildcareRepository.create(app_snapshot=snapshot, institution_id=None, database_url=None)
    )

    feedback = repository.snapshot["feedback"][0]
    history = repository.get_child_history("c-11", 7)

    assert feedback["feedbackId"] == "fb-structured-1"
    assert feedback["id"] == "fb-structured-1"
    assert feedback["interventionCardId"] == "task-parent-1"
    assert feedback["executed"] is False
    assert feedback["improved"] is False
    assert history["feedback"][0]["notes"] == "The family could not execute the hydration step tonight."
    assert history["timeline"][0]["type"] == "feedback"
    assert history["timeline"][0]["summary"] == "The family could not execute the hydration step tonight."
