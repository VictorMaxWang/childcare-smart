import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnableAdminConsultationFeed } from "./use-admin-workspace-loader";
import { buildAdminConsultationWorkspaceView, getAdminConsultationFeedBadge } from "./use-admin-consultation-workspace";
import { normalizeAdminNotificationSource } from "@/lib/db/notification-events";

test("shouldEnableAdminConsultationFeed depends on visible children and not notification readiness", () => {
  assert.equal(
    shouldEnableAdminConsultationFeed({
      visibleChildrenCount: 0,
      notificationReady: false,
    }),
    false
  );

  assert.equal(
    shouldEnableAdminConsultationFeed({
      visibleChildrenCount: 2,
      notificationReady: false,
    }),
    true
  );

  assert.equal(
    shouldEnableAdminConsultationFeed({
      visibleChildrenCount: 2,
      notificationReady: true,
    }),
    true
  );
});

test("getAdminConsultationFeedBadge distinguishes backend, local fallback and unavailable states", () => {
  assert.deepEqual(
    getAdminConsultationFeedBadge({
      feedStatus: "ready",
      localConsultationCount: 2,
    }),
    {
      label: "后端推送",
      variant: "success",
    }
  );

  assert.deepEqual(
    getAdminConsultationFeedBadge({
      feedStatus: "unavailable",
      localConsultationCount: 1,
    }),
    {
      label: "本地兜底",
      variant: "outline",
    }
  );

  assert.deepEqual(
    getAdminConsultationFeedBadge({
      feedStatus: "unavailable",
      localConsultationCount: 0,
    }),
    {
      label: "推送暂不可用",
      variant: "warning",
    }
  );
});

test("buildAdminConsultationWorkspaceView keeps board-ready fallback state stable", () => {
  const view = buildAdminConsultationWorkspaceView({
    institutionName: "SmartChildcare",
    children: [{ id: "child-1", name: "安安", className: "向日葵班" }],
    consultationFeed: {
      items: [],
      status: "unavailable",
      error: "feed unavailable",
    },
    localConsultations: [
      {
        consultationId: "consult-1",
        triggerReason: "连续两天情绪波动",
        triggerType: ["continuous-abnormality"],
        triggerReasons: ["连续两天情绪波动"],
        participants: [{ id: "health-agent", label: "Health Agent" }],
        childId: "child-1",
        riskLevel: "high",
        agentFindings: [],
        summary: "需要尽快跟进",
        keyFindings: ["需要家园同步观察"],
        healthAgentView: {
          role: "HealthObservationAgent",
          title: "Health Agent",
          summary: "晨检异常",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        dietBehaviorAgentView: {
          role: "DietBehaviorAgent",
          title: "Diet Agent",
          summary: "饮水偏少",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        parentCommunicationAgentView: {
          role: "ParentCommunicationAgent",
          title: "Parent Agent",
          summary: "需要家长反馈",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        inSchoolActionAgentView: {
          role: "InSchoolActionAgent",
          title: "Execution Agent",
          summary: "今日加强观察",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        todayInSchoolActions: ["今日加强观察"],
        tonightAtHomeActions: ["今晚补充反馈"],
        followUp48h: ["48 小时后复查"],
        parentMessageDraft: "今晚请先反馈情绪变化。",
        directorDecisionCard: {
          title: "重点会诊",
          reason: "需要园长确认",
          recommendedOwnerRole: "admin",
          recommendedOwnerName: "陈园长",
          recommendedAt: "2026-04-07T12:30:00.000Z",
          status: "pending",
        },
        explainability: [{ label: "关键发现", detail: "需要家园同步观察" }],
        nextCheckpoints: ["明天晨检复看"],
        evidenceItems: [],
        coordinatorSummary: {
          finalConclusion: "建议今天完成协同",
          riskLevel: "high",
          problemDefinition: "情绪波动需要干预",
          schoolAction: "今日加强观察",
          homeAction: "今晚补充反馈",
          observationPoints: ["入园情绪"],
          reviewIn48h: "48 小时后复查",
          shouldEscalateToAdmin: true,
        },
        schoolAction: "今日加强观察",
        homeAction: "今晚补充反馈",
        observationPoints: ["入园情绪"],
        reviewIn48h: "48 小时后复查",
        shouldEscalateToAdmin: true,
        source: "vivo",
        generatedAt: "2026-04-07T10:00:00.000Z",
      },
    ],
    notificationEvents: [],
    limit: 4,
  });

  assert.equal(view.feedStatus, "unavailable");
  assert.equal(view.feedBadge.label, "本地兜底");
  assert.equal(view.priorityItems.length, 1);
  assert.equal(view.priorityItems[0]?.notificationPayload?.priorityItemId, "consult-1");
});

test("normalizeAdminNotificationSource drops malformed source payloads", () => {
  assert.equal(normalizeAdminNotificationSource(null), null);
  assert.equal(normalizeAdminNotificationSource("bad-json"), null);
  assert.equal(normalizeAdminNotificationSource([]), null);
  assert.equal(normalizeAdminNotificationSource({}), null);

  assert.deepEqual(
    normalizeAdminNotificationSource({
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: ["child-1", "", "child-1"],
      relatedClassNames: ["向日葵班"],
      consultationId: "consult-1",
      relatedConsultationIds: ["consult-1", "consult-1"],
    }),
    {
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: ["child-1"],
      relatedClassNames: ["向日葵班"],
      consultationId: "consult-1",
      relatedConsultationIds: ["consult-1"],
    }
  );
});
