from __future__ import annotations

import asyncio

from app.services.health_file_bridge_service import run_health_file_bridge


def test_health_file_bridge_service_returns_extraction_only_output_for_metadata_input():
    result = asyncio.run(
        run_health_file_bridge(
            {
                "childId": "child-1",
                "sourceRole": "teacher",
                "files": [
                    {
                        "fileId": "file-1",
                        "name": "outside-note.pdf",
                        "mimeType": "application/pdf",
                        "sizeBytes": 1024,
                    }
                ],
                "requestSource": "pytest-service",
            }
        )
    )

    assert result["source"] == "backend-text-fallback"
    assert result["fallback"] is True
    assert result["mock"] is True
    assert result["liveReadyButNotVerified"] is True
    assert result["fileType"] == "pdf"
    assert "T9 bridge" in result["disclaimer"]
    assert result["extractedFacts"]
    assert result["riskItems"][0]["title"] == "Low-confidence extraction from limited text hints"
    assert result["followUpHints"]
    assert result["actionMapping"]["schoolTodayActions"]
    assert result["actionMapping"]["familyTonightActions"]
    assert result["actionMapping"]["followUpPlan"]
    assert result["actionMapping"]["escalationSuggestion"]["level"] == "routine"
    assert isinstance(result["confidence"], float)


def test_health_file_bridge_service_extracts_fever_medication_and_allergy_hints_conservatively():
    result = asyncio.run(
        run_health_file_bridge(
            {
                "childId": "child-2",
                "sourceRole": "parent",
                "fileKind": "prescription",
                "files": [
                    {
                        "fileId": "file-2",
                        "name": "recheck-slip.png",
                        "mimeType": "image/png",
                        "previewText": "发热 38.1，明早复查，继续雾化",
                    }
                ],
                "requestSource": "pytest-service",
                "optionalNotes": "家长补充：有过敏史，今天仍在用药。",
            }
        )
    )

    fact_labels = [item["label"] for item in result["extractedFacts"]]
    risk_titles = [item["title"] for item in result["riskItems"]]
    contraindication_titles = [item["title"] for item in result["contraindications"]]

    assert result["fileType"] == "mixed"
    assert "Temperature mention" in fact_labels
    assert "Allergy mention" in fact_labels
    assert "Medication mention" in fact_labels
    assert "Temperature-related signal needs manual confirmation" in risk_titles
    assert "Potential allergy-related instruction detected" in risk_titles
    assert "Do not infer a daycare medication plan from the file alone" in contraindication_titles
    assert result["actionMapping"]["escalationSuggestion"]["level"] == "same-day-review"
    assert any(
        item["title"] == "Temporarily avoid unverified allergen exposure today"
        for item in result["actionMapping"]["schoolTodayActions"]
    )
    assert any(
        item["title"] == "Do not administer medicine from the file alone"
        for item in result["actionMapping"]["schoolTodayActions"]
    )
    assert result["confidence"] >= 0.6


def test_health_file_bridge_service_filters_out_risky_actions_when_contraindications_exist():
    result = asyncio.run(
        run_health_file_bridge(
            {
                "childId": "child-3",
                "sourceRole": "teacher",
                "files": [
                    {
                        "fileId": "file-3",
                        "name": "allergy-note.png",
                        "mimeType": "image/png",
                        "previewText": "allergy medication fever 38.2 follow-up tomorrow",
                    }
                ],
                "requestSource": "pytest-service",
            }
        )
    )

    flattened_action_text = " ".join(
        f"{item['title']} {item['detail']}".lower()
        for bucket in (
            result["actionMapping"]["schoolTodayActions"],
            result["actionMapping"]["familyTonightActions"],
            result["actionMapping"]["followUpPlan"],
        )
        for item in bucket
    )

    assert "resume normal activity" not in flattened_action_text
    assert "allergen exposure is acceptable" not in flattened_action_text
    assert "administer medicine based on the file" not in flattened_action_text
