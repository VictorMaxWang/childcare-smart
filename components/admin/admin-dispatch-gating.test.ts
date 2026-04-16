import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DirectorDecisionCard from "./DirectorDecisionCard.tsx";
import RiskPriorityBoard from "./RiskPriorityBoard.tsx";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";

function buildConsultationItem(): AdminConsultationPriorityItem {
  return {
    consultationId: "consultation-1",
    childId: "child-1",
    riskLevel: "high",
    generatedAt: "2026-04-12T00:00:00.000Z",
    shouldEscalateToAdmin: true,
    recommendedOwnerRole: "admin",
    decision: {
      priorityLabel: "P1",
      statusLabel: "Pending",
      riskLabel: "High risk",
      className: "Sunflower class",
      childName: "Child A",
      summary: "Need follow-up.",
      whyHighPriority: "Repeated issues detected.",
      recommendedOwnerName: "Director",
      recommendedAtLabel: "Today 18:00",
      triggerReasons: ["Repeated issue"],
      keyFindings: ["Mood changes"],
      schoolActions: ["Observe today"],
      homeActions: ["Call parents"],
      followUpActions: ["Review in 48h"],
      generatedAtLabel: "2026-04-12 08:30",
      statusSource: "consultation",
      status: "pending",
    } as AdminConsultationPriorityItem["decision"],
    trace: {
      consultationId: "consultation-1",
      childName: "Child A",
      summary: "trace",
      riskLevel: "high",
      recentSignals: [],
      recentActions: [],
      evidence: [],
      nextSteps: [],
    } as AdminConsultationPriorityItem["trace"],
    dispatchBindingScope: "consultation",
    notificationPayload: {
      eventType: "consultation-follow-up",
      priorityItemId: "consultation-1",
      title: "Follow up Child A",
      summary: "Need review",
      targetType: "child",
      targetId: "child-1",
      targetName: "Child A",
      priorityLevel: "P1",
      priorityScore: 90,
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "Director",
      recommendedAction: "Call parents",
      recommendedDeadline: "Today 18:00",
      reasonText: "Need follow-up",
      evidence: [],
      source: {
        institutionName: "Demo school",
        workflow: "daily-priority",
        relatedChildIds: ["child-1"],
        relatedClassNames: ["Sunflower class"],
        consultationId: "consultation-1",
      },
    },
  };
}

test("DirectorDecisionCard hides the dispatch CTA when dispatch backend is unavailable", () => {
  const html = renderToStaticMarkup(
    React.createElement(DirectorDecisionCard, {
      item: buildConsultationItem(),
      dispatchAvailable: false,
      dispatchStatusMessage: "Dispatch unavailable",
    })
  );

  assert.ok(html.includes("Dispatch unavailable"));
  assert.ok(!html.includes("创建会诊派单"));
});

test("RiskPriorityBoard removes the clickable empty-state CTA when dispatch backend is unavailable", () => {
  const html = renderToStaticMarkup(
    React.createElement(RiskPriorityBoard, {
      items: [],
      dispatchAvailable: false,
      dispatchStatusMessage: "Dispatch unavailable",
      emptyTitle: "No priority consultations",
      emptyDescription: "Read only",
    })
  );

  assert.ok(html.includes("Dispatch unavailable"));
  assert.ok(!html.includes("Go to consultation entry"));
});
