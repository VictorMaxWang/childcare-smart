from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_parent_suggestions():
    response = client.post(
        "/api/v1/agents/parent/suggestions",
        json={"snapshot": {"child": {"name": "Xiaoming"}, "summary": {}}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert "summary" in body


def test_parent_trend_query():
    response = client.post(
        "/api/v1/agents/parent/trend-query",
        json={
            "question": "Did eating improve this week?",
            "childId": "child-1",
            "appSnapshot": {
                "children": [
                    {
                        "id": "child-1",
                        "name": "Anan",
                        "nickname": "Bao",
                        "institutionId": "inst-test",
                        "className": "Class 1",
                    }
                ],
                "attendance": [],
                "meals": [
                    {
                        "id": "meal-1",
                        "childId": "child-1",
                        "date": "2026-04-04",
                        "meal": "lunch",
                        "foods": ["rice", "vegetable", "protein"],
                        "intakeLevel": "good",
                        "preference": "accept",
                        "waterMl": 170,
                        "nutritionScore": 84,
                        "aiEvaluation": {"summary": "mealtime quality was solid"},
                    },
                    {
                        "id": "meal-2",
                        "childId": "child-1",
                        "date": "2026-04-03",
                        "meal": "lunch",
                        "foods": ["rice", "vegetable", "protein"],
                        "intakeLevel": "medium",
                        "preference": "neutral",
                        "waterMl": 140,
                        "nutritionScore": 76,
                        "aiEvaluation": {"summary": "eating became steadier"},
                    },
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
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["intent"]
    assert body["metric"]
    assert body["series"]
    assert "comparison" in body
    assert "dataQuality" in body


def test_parent_trend_query_demo_snapshot_fallback_honesty():
    response = client.post(
        "/api/v1/agents/parent/trend-query",
        json={
            "question": "Has sleep been stable in the last two weeks?",
            "childId": "c-11",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo_snapshot"
    assert body["fallback"] is True
    assert body["dataQuality"]["fallbackUsed"] is True
    assert body["dataQuality"]["observedDays"] >= 0
    assert body["dataQuality"]["coverageRatio"] >= 0
    assert isinstance(body["dataQuality"]["sparse"], bool)
    assert body["warnings"]


def test_teacher_run():
    response = client.post(
        "/api/v1/agents/teacher/run",
        json={
            "workflow": "follow-up",
            "scope": "child",
            "targetChildId": "c1",
            "visibleChildren": [{"id": "c1", "name": "Xiaoming"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] == "follow-up"
    assert body["source"] == "mock"
    assert "interventionCard" in body


def test_health_file_bridge_smoke_with_preview_text():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "childId": "c1",
            "sourceRole": "teacher",
            "files": [
                {
                    "name": "outside-note.pdf",
                    "mimeType": "application/pdf",
                    "previewText": "发热 38.0，明早复查",
                }
            ],
            "requestSource": "agents-mock-smoke",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "backend-text-fallback"
    assert body["mock"] is True
    assert body["extractedFacts"]
    assert body["followUpHints"]
    assert body["actionMapping"]["schoolTodayActions"]
    assert body["actionMapping"]["followUpPlan"]
    assert "confidence" in body


def test_admin_run():
    response = client.post(
        "/api/v1/agents/admin/run",
        json={"workflow": "daily-priority", "visibleChildren": [{"id": "c1"}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert body["priorityTopItems"]


def test_admin_run_sparse_payload_uses_demo_roster_context():
    response = client.post("/api/v1/agents/admin/run", json={"workflow": "daily-priority"})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert body["institutionScope"]["visibleChildren"] == 36
    assert body["institutionScope"]["healthAbnormalCount"] == 6
    assert body["institutionScope"]["pendingReviewCount"] == 6
    assert body["priorityTopItems"][0]["targetId"] == "c-15"


def test_weekly_report_teacher_role():
    response = client.post(
        "/api/v1/agents/reports/weekly",
        json={
            "role": "teacher",
            "snapshot": {
                "institutionName": "Demo Institution",
                "periodLabel": "近 7 天",
                "role": "机构管理员",
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert body["schemaVersion"] == "v2-actionized"
    assert body["role"] == "teacher"
    assert [section["id"] for section in body["sections"]] == [
        "weeklyAnomalies",
        "makeUpItems",
        "nextWeekObservationFocus",
    ]
    assert body["primaryAction"]["ownerRole"] == "teacher"


def test_health_file_bridge():
    response = client.post(
        "/api/v1/agents/health-file-bridge",
        json={
            "childId": "child-bridge-1",
            "sourceRole": "teacher",
            "files": [
                {
                    "fileId": "file-1",
                    "name": "clinic-note.pdf",
                    "mimeType": "application/pdf",
                }
            ],
            "requestSource": "pytest-agents-mock",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "backend-text-fallback"
    assert body["mock"] is True
    assert body["riskItems"]
    assert body["contraindications"] is not None
    assert body["actionMapping"]["schoolTodayActions"]
    assert body["actionMapping"]["familyTonightActions"]


def test_weekly_report_legacy_snapshot_role_normalizes_admin():
    response = client.post(
        "/api/v1/agents/reports/weekly",
        json={"snapshot": {"institutionName": "Demo Institution", "role": "机构管理员"}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert body["role"] == "admin"
    assert [section["id"] for section in body["sections"]] == [
        "highRiskClosureRate",
        "parentFeedbackRate",
        "classIssueHeat",
        "nextWeekGovernanceFocus",
    ]
    assert body["trendPrediction"] in {"stable", "down"}


def test_weekly_report_parent_role_can_hydrate_demo_context():
    response = client.post("/api/v1/agents/reports/weekly", json={"role": "parent"})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "mock"
    assert body["role"] == "parent"
    assert body["summary"]
    assert body["highlights"]
    assert body["nextWeekActions"]
    assert [section["id"] for section in body["sections"]] == [
        "weeklyChanges",
        "topHomeAction",
        "feedbackNeeded",
    ]


def test_weekly_report_requires_role_or_legacy_snapshot_role():
    response = client.post("/api/v1/agents/reports/weekly", json={"snapshot": {"institutionName": "Demo Institution"}})
    assert response.status_code == 400


def test_high_risk_consultation():
    response = client.post(
        "/api/v1/agents/consultations/high-risk",
        json={
            "targetChildId": "c1",
            "currentUser": {},
            "visibleChildren": [{"id": "c1", "name": "Xiaoming"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] in {"mock", "vivo"}
    assert "consultationId" in body
    assert "interventionCard" in body
    assert "providerTrace" in body
    assert "memoryMeta" in body
    assert "traceMeta" in body
    assert "model" in body
    assert body["evidenceItems"]
    assert any(
        item["sourceType"] == "derived_explainability"
        and item["requiresHumanReview"] is True
        for item in body["evidenceItems"]
    )
    assert isinstance(body["realProvider"], bool)
    assert isinstance(body["fallback"], bool)
    assert body["traceMeta"]["memory"]["backend"]
    assert body["directorDecisionCard"]["recommendedOwnerName"]
    assert body["nextCheckpoints"]
    assert [item["label"] for item in body["explainability"][:3]] == [
        "Agent 参与",
        "关键发现",
        "协调结论",
    ]


def test_high_risk_consultation_sparse_payload_uses_demo_child_context():
    response = client.post("/api/v1/agents/consultations/high-risk", json={"targetChildId": "c-16"})
    assert response.status_code == 200
    body = response.json()
    assert body["consultationId"] == "consultation-c-16"
    assert body["source"] in {"mock", "vivo"}
    assert body["autoContext"]["childId"] == "c-16"
    assert body["autoContext"]["className"] == "晨曦班"
    assert body["autoContext"]["morningCheckAlerts"]
    assert body["autoContext"]["parentFeedbackNotes"]


def test_multimodal_endpoints():
    vision = client.post(
        "/api/v1/multimodal/vision-meal",
        json={"imageDataUrl": "data:image/png;base64,abc"},
    )
    assert vision.status_code == 200
    assert vision.json()["source"] == "mock"

    diet = client.post("/api/v1/multimodal/diet-evaluation", json={"input": {"mealFoods": []}})
    assert diet.status_code == 200
    assert diet.json()["source"] == "mock"
