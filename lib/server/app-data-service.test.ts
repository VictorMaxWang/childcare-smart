import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { ApiRouteError } from "@/lib/server/api-errors";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { AppDataService } from "@/lib/server/app-data-service";
import type { AppDataRepository } from "@/lib/server/app-data-repository";

class MemoryRepository implements AppDataRepository {
  private snapshot: unknown;

  constructor(snapshot: unknown = createDemoSeedSnapshot("2026-05-02T00:00:00.000Z")) {
    this.snapshot = structuredClone(snapshot);
  }

  async load(session: SessionUser): Promise<ApiExtendedSnapshot> {
    return normalizeExtendedSnapshot(structuredClone(this.snapshot), session);
  }

  async save(_session: SessionUser, snapshot: ApiExtendedSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

class AtomicOnlyRepository implements AppDataRepository {
  private snapshot: unknown = createDemoSeedSnapshot("2026-05-02T00:00:00.000Z");
  mutateCount = 0;

  async load(): Promise<ApiExtendedSnapshot> {
    throw new Error("non-atomic load must not run");
  }

  async save(): Promise<void> {
    throw new Error("non-atomic save must not run");
  }

  async mutate<T>(
    session: SessionUser,
    mutator: (snapshot: ApiExtendedSnapshot) => T
  ): Promise<T> {
    this.mutateCount += 1;
    const snapshot = normalizeExtendedSnapshot(structuredClone(this.snapshot), session);
    const result = mutator(snapshot);
    this.snapshot = structuredClone(snapshot);
    return result;
  }
}

type TestRecord = {
  id: string;
  childId: string;
  remark?: string;
  archivedAt?: string;
};

type TestChild = {
  id: string;
  name: string;
  institutionId: string;
  className: string;
  classId?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  restoredAt?: string;
  restoredBy?: string;
};

type TestTeacher = {
  teacherId: string;
  name: string;
  className?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  restoredAt?: string;
  restoredBy?: string;
};

function asTestRecord(record: unknown) {
  return record as TestRecord;
}

function asTestChild(child: unknown) {
  return child as TestChild;
}

function asTestTeacher(teacher: unknown) {
  return teacher as TestTeacher;
}

function demoUser(id: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === id);
  assert.ok(user, `Missing demo account ${id}`);
  return user;
}

function assertApiError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ApiRouteError);
    assert.equal(error.code, code);
    return true;
  };
}

test("director aggregate dashboard succeeds", async () => {
  const repo = new MemoryRepository();
  const dashboard = await new AppDataService(demoUser("u-admin"), repo).getDirectorDashboard();

  assert.equal(typeof dashboard.childCount, "number");
  assert.ok(dashboard.childCount >= 3);
  assert.ok(dashboard.teacherCount >= 2);
});

test("parent and cross-class teacher are denied before data mutation", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher"), repo);
  const teacher2 = new AppDataService(demoUser("u-teacher2"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const deniedToken = `denied-${Date.now()}`;

  await assert.rejects(() => parent.getChild("c-3"), assertApiError("forbidden_scope"));
  await assert.rejects(
    () => teacher.createRecord("health", { childId: "c-1", remark: deniedToken }),
    assertApiError("forbidden_scope")
  );

  const visibleRecords = await teacher2.listRecords("health", { childId: "c-1", includeArchived: true });
  assert.equal(visibleRecords.some((record) => asTestRecord(record).remark === deniedToken), false);
});

test("record create/read/update/archive persists through the repository", async () => {
  const repo = new MemoryRepository();
  const service = new AppDataService(demoUser("u-teacher2"), repo);
  const token = `e01-crud-${Date.now()}`;

  const created = asTestRecord(await service.createRecord("health", {
    childId: "c-1",
    date: "2026-05-02",
    temperature: 36.8,
    remark: token,
  }));

  assert.ok(created.id);
  assert.equal(created.childId, "c-1");

  const afterCreate = await service.listRecords("health", { childId: "c-1" });
  assert.equal(
    afterCreate.some((record) => asTestRecord(record).id === created.id && asTestRecord(record).remark === token),
    true
  );

  const updated = await service.updateRecord("health", created.id, {
    childId: "c-3",
    id: "client-forged-id",
    remark: `${token}-updated`,
  });
  assert.equal(asTestRecord(updated).id, created.id);
  assert.equal(asTestRecord(updated).childId, "c-1");
  assert.equal(asTestRecord(updated).remark, `${token}-updated`);

  const archived = await service.archiveRecord("health", created.id, "archive");
  assert.ok(archived?.archivedAt);

  const activeOnly = await service.listRecords("health", { childId: "c-1" });
  assert.equal(activeOnly.some((record) => asTestRecord(record).id === created.id), false);

  const withArchived = await service.listRecords("health", { childId: "c-1", includeArchived: true });
  assert.equal(withArchived.some((record) => asTestRecord(record).id === created.id && asTestRecord(record).archivedAt), true);
});

test("bound normal teacher records are readable by the authorized normal parent", async () => {
  const repo = new MemoryRepository();
  const teacherSession: SessionUser = {
    ...demoUser("u-teacher2"),
    accountKind: "normal",
    classId: "class-morning",
  };
  const parentSession: SessionUser = {
    ...demoUser("u-parent"),
    accountKind: "normal",
    childIds: ["c-1"],
  };
  const teacher = new AppDataService(teacherSession, repo);
  const parent = new AppDataService(parentSession, repo);

  const health = asTestRecord(
    await teacher.createRecord("health", {
      childId: "c-1",
      date: "2026-07-24",
      temperature: 36.8,
      remark: "shared-health",
    })
  );
  const meal = asTestRecord(
    await teacher.createRecord("meal", {
      childId: "c-1",
      date: "2026-07-24",
      meal: "午餐",
      foods: [{ id: "food-1", name: "米饭", category: "主食", amount: "1碗" }],
      nutritionScore: 88,
      photoUrls: [
        "/api/attachments/meal-photo-normal/content",
        "https://tracker.example/meal.png",
      ],
    })
  );
  const growth = asTestRecord(
    await teacher.createRecord("growth", {
      childId: "c-1",
      description: "shared-growth",
      selectedIndicators: ["主动表达"],
      mediaUrls: ["/api/attachments/growth-photo-normal/content"],
    })
  );

  const parentHealth = await parent.listRecords("health", { childId: "c-1" });
  const parentMeals = await parent.listRecords("meal", { childId: "c-1" });
  const parentGrowth = await parent.listRecords("growth", { childId: "c-1" });

  assert.ok(parentHealth.some((record) => asTestRecord(record).id === health.id));
  const parentMeal = parentMeals.find(
    (record) => asTestRecord(record).id === meal.id
  ) as { photoUrls?: string[] } | undefined;
  const parentGrowthRecord = parentGrowth.find(
    (record) => asTestRecord(record).id === growth.id
  ) as { mediaUrls?: string[] } | undefined;
  assert.deepEqual(parentMeal?.photoUrls, [
    "/api/attachments/meal-photo-normal/content",
  ]);
  assert.deepEqual(parentGrowthRecord?.mediaUrls, [
    "/api/attachments/growth-photo-normal/content",
  ]);
});

test("normal home-school messages use a canonical child conversation and enforce participants", async () => {
  const repo = new MemoryRepository();
  const parentSession: SessionUser = {
    ...demoUser("u-parent"),
    accountKind: "normal",
    childIds: ["c-1"],
  };
  const teacherSession: SessionUser = {
    ...demoUser("u-teacher2"),
    accountKind: "normal",
    classId: "class-morning",
  };
  const crossClassTeacher: SessionUser = {
    ...demoUser("u-teacher"),
    accountKind: "normal",
    classId: "class-sunrise",
  };
  const parent = new AppDataService(parentSession, repo);
  const teacher = new AppDataService(teacherSession, repo);
  const otherTeacher = new AppDataService(crossClassTeacher, repo);
  const director = new AppDataService(
    { ...demoUser("u-admin"), accountKind: "normal" },
    repo
  );

  const sent = await parent.sendMessage({
    childId: "c-1",
    conversationId: "conv-c-3-home-school",
    content: "normal canonical conversation",
  });
  assert.equal(sent.conversationId, "conv-c-1-home-school");

  const snapshot = await repo.load(parentSession);
  const conversation = snapshot.conversations.find(
    (item) => item.conversationId === sent.conversationId
  );
  assert.ok(conversation);
  assert.deepEqual([...conversation.participantRoles].sort(), ["parent", "teacher"]);

  await assert.rejects(
    () =>
      teacher.replyMessage(sent.messageId, {
        conversationId: "conv-c-3-home-school",
        content: "must not switch threads",
      }),
    assertApiError("conflict")
  );
  const reply = await teacher.replyMessage(sent.messageId, {
    content: "canonical reply",
  });
  assert.equal(reply.conversationId, sent.conversationId);

  await assert.rejects(
    () => otherTeacher.markMessageRead(sent.messageId),
    assertApiError("forbidden_scope")
  );

  const directorMessages = await director.listMessages({ childId: "c-1" });
  assert.ok(directorMessages.some((message) => message.messageId === sent.messageId));
  const marked = await director.markMessageRead(sent.messageId);
  assert.ok(marked?.readBy.includes("u-admin"));
  const directorReply = await director.replyMessage(sent.messageId, {
    content: "director supervised reply",
  });
  assert.equal(directorReply.senderRole, "director");
  assert.equal(directorReply.conversationId, sent.conversationId);

  const closed = await teacher.updateConversationStatus(
    sent.conversationId,
    { status: "closed" }
  );
  assert.equal(closed?.status, "closed");
  await assert.rejects(
    () =>
      otherTeacher.updateConversationStatus(sent.conversationId, {
        status: "archived",
      }),
    assertApiError("forbidden_scope")
  );
});

test("service writes through the repository atomic mutation contract when available", async () => {
  const repo = new AtomicOnlyRepository();
  const service = new AppDataService(demoUser("u-admin"), repo);

  const child = asTestChild(
    await service.createChild({
      name: "原子写入测试",
      birthDate: "2022-05-10",
      gender: "女",
      className: "向阳班",
    })
  );

  assert.ok(child.id);
  assert.equal(repo.mutateCount, 1);
});

test("feedback status and weekly report writes use the atomic repository contract", async () => {
  const repo = new AtomicOnlyRepository();
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const director = new AppDataService(demoUser("u-admin"), repo);
  const feedback = await parent.createFeedback({
    childId: "c-1",
    content: "原子写入反馈",
    sourceChannel: "parent-agent",
  });
  const feedbackId = feedback.feedback.feedbackId ?? feedback.feedback.id;
  assert.ok(feedbackId);

  const updated = await director.updateFeedbackStatus(feedbackId, {
    status: "in-progress",
  });
  assert.equal(updated.feedback.status, "in-progress");

  const report = await director.createWeeklyReport({
    scopeType: "institution",
    scopeId: demoUser("u-admin").institutionId,
    title: "原子写入周报",
    periodStart: "2026-04-27",
    periodEnd: "2026-05-03",
  });
  assert.equal(report.title, "原子写入周报");
  assert.equal(repo.mutateCount, 3);
});

test("storybook upsert cannot rebind an existing id to another family child", async () => {
  const repo = new MemoryRepository();
  const baseParent = demoUser("u-parent");
  const firstParent: SessionUser = {
    ...baseParent,
    id: "u-parent-first",
    childIds: ["c-1"],
    accountKind: "normal",
  };
  const secondParent: SessionUser = {
    ...baseParent,
    id: "u-parent-second",
    childIds: ["c-4"],
    accountKind: "normal",
  };
  const firstService = new AppDataService(firstParent, repo);
  const secondService = new AppDataService(secondParent, repo);

  await secondService.upsertStorybook({
    storybookId: "storybook-cross-family-guard",
    childId: "c-4",
    pages: [{ title: "第二个家庭的绘本" }],
  });

  await assert.rejects(
    () =>
      firstService.upsertStorybook({
        storybookId: "storybook-cross-family-guard",
        childId: "c-1",
        pages: [{ title: "试图覆盖" }],
      }),
    assertApiError("forbidden_scope")
  );

  const persisted = await secondService.getStorybook(
    "storybook-cross-family-guard"
  );
  assert.equal(persisted.childId, "c-4");
  assert.deepEqual(persisted.pages, [{ title: "第二个家庭的绘本" }]);
});

test("storybook source records cannot reference another family child", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const foreignGrowth = asTestRecord(
    await teacher.createRecord("growth", {
      childId: "c-1",
      description: "仅属于第一名幼儿的成长记录",
    })
  );
  const parent: SessionUser = {
    ...demoUser("u-parent"),
    id: "u-parent-c4-only",
    childIds: ["c-4"],
    accountKind: "normal",
  };

  await assert.rejects(
    () =>
      new AppDataService(parent, repo).upsertStorybook({
        storybookId: "storybook-foreign-source-guard",
        childId: "c-4",
        sourceRecordIds: [foreignGrowth.id],
        pages: [{ title: "不得引用其他幼儿素材" }],
      }),
    assertApiError("forbidden_scope")
  );
});

test("storybook list prioritizes the latest save over a stale provider generation time", async () => {
  const repo = new MemoryRepository();
  const service = new AppDataService(demoUser("u-teacher2"), repo);

  await service.upsertStorybook({
    storybookId: "storybook-future-generated",
    childId: "c-1",
    generatedAt: "2099-01-01T00:00:00.000Z",
    pages: [{ title: "较早保存" }],
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await service.upsertStorybook({
    storybookId: "storybook-latest-saved",
    childId: "c-1",
    generatedAt: "2020-01-01T00:00:00.000Z",
    pages: [{ title: "刚刚保存" }],
  });

  const storybooks = (await service.listStorybooks({ childId: "c-1" }))
    .filter((item) =>
      new Set([
        "storybook-future-generated",
        "storybook-latest-saved",
      ]).has(item.storybookId)
    )
    .map((item) => item.storybookId);

  assert.deepEqual(storybooks, [
    "storybook-latest-saved",
    "storybook-future-generated",
  ]);
});

test("createConsultation preserves rich high-risk result fields", async () => {
  const repo = new MemoryRepository();
  const service = new AppDataService(demoUser("u-teacher2"), repo);

  const created = await service.createConsultation({
    consultationId: "consult-rich-safety",
    childId: "c-1",
    generatedAt: "2026-04-10T10:00:00.000Z",
    riskLevel: "high",
    source: "fallback",
    summary: "重点会诊闭环已启动，先完成园内复核和家庭反馈。",
    parentMessageDraft: "今晚请先完成一个稳定陪伴动作，完成后反馈孩子反应。本建议不替代医疗诊断。",
    reviewIn48h: "48 小时内复查园内和家庭反馈。",
    triggerReasons: ["连续观察信号需要复核"],
    keyFindings: ["分离过渡需要持续支持"],
    todayInSchoolActions: ["老师记录过渡前后的情绪变化"],
    tonightAtHomeActions: ["家长完成 10 分钟共读并反馈反应"],
    followUp48h: ["48 小时内由老师复查执行情况"],
    nextCheckpoints: ["明早入园过渡"],
    explainability: [{ label: "关键发现", detail: "来自老师观察和家庭反馈。" }],
    participants: [{ id: "coordinator", label: "Coordinator" }],
    shouldEscalateToAdmin: true,
    coordinatorSummary: {
      finalConclusion: "重点会诊闭环已启动",
      riskLevel: "high",
      problemDefinition: "连续观察信号需要复核",
      schoolAction: "老师记录过渡前后的情绪变化",
      homeAction: "家长完成 10 分钟共读并反馈反应",
      observationPoints: ["入园过渡"],
      reviewIn48h: "48 小时内复查园内和家庭反馈。",
      shouldEscalateToAdmin: true,
    },
    directorDecisionCard: {
      title: "P1 重点复核",
      reason: "需要园长确认闭环责任人。",
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "园长",
      recommendedAt: "2026-04-11T10:00:00.000Z",
      status: "pending",
    },
    interventionCard: {
      id: "card-rich-safety",
      title: "林小雨 家庭支持卡",
      riskLevel: "high",
      targetChildId: "c-1",
      triggerReason: "连续观察信号需要复核",
      summary: "重点会诊闭环已启动",
      todayInSchoolAction: "老师记录过渡前后的情绪变化",
      tonightHomeAction: "家长完成 10 分钟共读并反馈反应",
      homeSteps: ["共读 10 分钟", "反馈孩子反应"],
      observationPoints: ["是否愿意说出感受"],
      tomorrowObservationPoint: "明早入园过渡",
      reviewIn48h: "48 小时内复查园内和家庭反馈。",
      parentMessageDraft: "今晚请先完成一个稳定陪伴动作。",
      teacherFollowupDraft: "明早复查入园过渡。",
      source: "fallback",
    },
    evidenceItems: [
      {
        id: "evidence-rich-teacher",
        sourceType: "teacher_note",
        sourceLabel: "老师观察",
        sourceId: "note-1",
        summary: "老师记录到入园过渡需要陪伴。",
        confidence: "medium",
        requiresHumanReview: true,
        evidenceCategory: "risk_control",
        supports: [{ type: "finding", targetId: "finding:key:0", targetLabel: "分离过渡需要持续支持" }],
      },
    ],
    providerTrace: {
      provider: "local",
      source: "fallback",
      model: "rules",
      transport: "test",
      transportSource: "test",
      consultationSource: "unit-test",
      realProvider: false,
      fallback: true,
    },
    memoryMeta: {
      backend: "memory",
      degraded: false,
      usedSources: [],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
    traceMeta: {
      memory: {
        backend: "memory",
        degraded: false,
        usedSources: [],
        errors: [],
        matchedSnapshotIds: [],
        matchedTraceIds: [],
      },
    },
  });

  const record = created as unknown as Record<string, unknown>;
  const evidenceItems = record.evidenceItems as Array<Record<string, unknown>>;
  assert.equal(record.consultationId, "consult-rich-safety");
  assert.ok(evidenceItems.some((item) => item.id === "evidence-rich-teacher"));
  assert.equal((record.followUp48h as string[])[0], "48 小时内由老师复查执行情况");
  assert.equal(record.humanReviewRequired, true);
  assert.ok((record.manualReviewSummary as { reviewRequiredCount?: number }).reviewRequiredCount);
  assert.ok(Array.isArray(record.warnings));
  assert.equal(((record.traceMeta as Record<string, unknown>).dataQuality as { evidenceCount?: number }).evidenceCount, evidenceItems.length);

  const snapshot = await repo.load(demoUser("u-teacher2"));
  assert.equal(
    snapshot.consultations.filter((item) => item.consultationId === "consult-rich-safety").length,
    1
  );
  assert.equal(
    snapshot.interventionCards.some((item) => item.id === "card-rich-safety"),
    true
  );
  const consultationReminders = snapshot.reminders.filter(
    (item) => item.sourceId === "consult-rich-safety"
  );
  assert.deepEqual(
    [...new Set(consultationReminders.map((item) => item.targetRole))].sort(),
    ["admin", "parent", "teacher"]
  );
});

test("director can create, update, archive and restore child profiles through scoped service", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);
  const token = `e02-child-${Date.now()}`;

  const created = asTestChild(await director.createChild({
    name: token,
    birthDate: "2023-02-03",
    gender: "女",
    guardians: [{ name: "测试家长", relation: "母亲", phone: "13800000000" }],
    className: "向阳班",
    specialNotes: "E02 create child",
  }));

  assert.ok(created.id);
  assert.equal(created.institutionId, "inst-1");
  assert.equal(created.classId, "class-sunrise");

  const updated = asTestChild(await director.updateChild(created.id, {
    id: "client-forged-id",
    institutionId: "other-inst",
    archivedAt: "client-forged-archive",
    name: `${token}-updated`,
    className: "晨曦班",
  }));

  assert.equal(updated.id, created.id);
  assert.equal(updated.institutionId, "inst-1");
  assert.equal(updated.name, `${token}-updated`);
  assert.equal(updated.className, "晨曦班");
  assert.equal(updated.classId, "class-morning");
  assert.equal(updated.archivedAt, undefined);

  const oldClassTeacher: SessionUser = {
    ...demoUser("u-teacher"),
    classId: "class-sunrise",
  };
  const newClassTeacher: SessionUser = {
    ...demoUser("u-teacher2"),
    classId: "class-morning",
  };
  await assert.rejects(
    () => new AppDataService(oldClassTeacher, repo).getChild(created.id),
    assertApiError("forbidden_scope")
  );
  assert.equal(
    asTestChild(
      await new AppDataService(newClassTeacher, repo).getChild(created.id)
    ).id,
    created.id
  );

  const archived = asTestChild(await director.archiveChild(created.id, "archive", "unit-test"));
  assert.ok(archived.archivedAt);
  assert.equal(archived.archivedBy, "u-admin");
  assert.equal(archived.archiveReason, "unit-test");

  const activeOnly = await director.listChildren();
  assert.equal(activeOnly.some((child) => asTestChild(child).id === created.id), false);

  const restored = asTestChild(await director.archiveChild(created.id, "restore"));
  assert.equal(restored.archivedAt, undefined);
  assert.equal(restored.restoredBy, "u-admin");

  const afterRestore = await director.listChildren();
  assert.equal(afterRestore.some((child) => asTestChild(child).id === created.id), true);
});

test("role-scoped reminders cannot be read or closed by another role", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const director = new AppDataService(demoUser("u-admin"), repo);

  const consultation = await teacher.createConsultation({
    childId: "c-1",
    riskLevel: "high",
    summary: "需要三端协同复查",
  });
  const consultationId = consultation.consultationId;

  const parentReminders = await parent.listReminders({ childId: "c-1" });
  const teacherReminders = await teacher.listReminders({ childId: "c-1" });
  const directorReminders = await director.listReminders({ childId: "c-1" });
  assert.equal(
    parentReminders
      .filter((item) => item.sourceId === consultationId)
      .every((item) => item.targetRole === "parent"),
    true
  );
  assert.equal(
    teacherReminders
      .filter((item) => item.sourceId === consultationId)
      .every((item) => item.targetRole === "teacher"),
    true
  );
  assert.deepEqual(
    [...new Set(
      directorReminders
        .filter((item) => item.sourceId === consultationId)
        .map((item) => item.targetRole)
    )].sort(),
    ["admin", "parent", "teacher"]
  );

  const teacherReminder = directorReminders.find(
    (item) => item.sourceId === consultationId && item.targetRole === "teacher"
  );
  assert.ok(teacherReminder);
  await assert.rejects(
    () => parent.updateReminder(teacherReminder.reminderId, { status: "done" }),
    (error: unknown) =>
      error instanceof ApiRouteError && error.code === "forbidden_scope"
  );
  await assert.rejects(
    () =>
      parent.createReminder({
        childId: "c-1",
        targetRole: "admin",
        title: "越权提醒",
      }),
    (error: unknown) =>
      error instanceof ApiRouteError && error.code === "forbidden_scope"
  );
});

test("reminder retries reuse a stable id without crossing child scope", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const payload = {
    reminderId: "reminder-stable-retry",
    reminderType: "review-48h",
    targetRole: "teacher",
    childId: "c-1",
    targetId: "c-1",
    title: "48 小时复查",
    description: "复查同一条会诊任务。",
    sourceId: "consultation-stable-retry",
  };

  const first = await teacher.createReminder(payload);
  const retried = await teacher.createReminder(payload);
  assert.equal(first.reminderId, payload.reminderId);
  assert.equal(retried.reminderId, payload.reminderId);

  const listed = await teacher.listReminders({ childId: "c-1" });
  assert.equal(
    listed.filter((item) => item.reminderId === payload.reminderId).length,
    1
  );
  await assert.rejects(
    () =>
      teacher.createReminder({
        ...payload,
        childId: "c-4",
        targetId: "c-4",
      }),
    assertApiError("forbidden_scope")
  );
});

test("retrying a resolved consultation keeps server state and completed projections", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const created = await teacher.createConsultation({
    childId: "c-1",
    riskLevel: "high",
    summary: "重试前完成的会诊",
  });

  await teacher.updateConsultationStatus(created.consultationId, {
    status: "resolved",
  });
  const completedSnapshot = await repo.load(demoUser("u-admin"));
  completedSnapshot.tasks = completedSnapshot.tasks.map((task) =>
    task.legacyRefs?.consultationId === created.consultationId
      ? {
          ...task,
          status: "completed",
          completedAt: "2026-07-25T10:00:00.000Z",
          completionSummary: "unit-test-evidence",
          lastEvidenceAt: "2026-07-25T10:00:00.000Z",
        }
      : task
  );
  completedSnapshot.reminders = completedSnapshot.reminders.map((reminder) =>
    reminder.sourceId === created.consultationId
      ? { ...reminder, status: "done" }
      : reminder
  );
  await repo.save(demoUser("u-admin"), completedSnapshot);

  const retried = await teacher.createConsultation({
    ...created,
    consultationId: created.consultationId,
    workflowStatus: "pending",
    status: "active",
  });
  assert.equal((retried as { workflowStatus?: string }).workflowStatus, "resolved");
  assert.equal((retried as { status?: string }).status, "resolved");

  const afterRetry = await repo.load(demoUser("u-admin"));
  const relatedTasks = afterRetry.tasks.filter(
    (task) => task.legacyRefs?.consultationId === created.consultationId
  );
  assert.equal(relatedTasks.every((task) => task.status === "completed"), true);
  assert.equal(
    relatedTasks.every(
      (task) => task.completionSummary === "unit-test-evidence"
    ),
    true
  );
  assert.equal(
    afterRetry.reminders
      .filter((reminder) => reminder.sourceId === created.consultationId)
      .every((reminder) => reminder.status === "done"),
    true
  );
});

test("record creation is idempotent for the same teacher source draft record", async () => {
  const repo = new MemoryRepository();
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const input = {
    childId: "c-1",
    category: "情绪表现",
    description: "语音快速记录",
    sourceDraftId: "voice-draft-idempotent",
    sourceRecordId: "voice-draft-idempotent-record-1",
  };

  const first = (await teacher.createRecord("growth", input)) as { id: string };
  const second = (await teacher.createRecord("growth", input)) as { id: string };
  assert.equal(second.id, first.id);

  const records = await teacher.listRecords("growth", { childId: "c-1" });
  assert.equal(
    records.filter(
      (item) =>
        (item as { sourceDraftId?: string }).sourceDraftId ===
        input.sourceDraftId
    ).length,
    1
  );
});

test("ordinary child CRUD cannot forge a parent account binding", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);

  await assert.rejects(
    () =>
      director.createChild({
        name: "伪造绑定",
        birthDate: "2023-02-03",
        gender: "女",
        className: "向阳班",
        parentUserId: "u-parent",
      }),
    assertApiError("invalid_request")
  );
});

test("child CRUD normalizes class names and rejects empty class bindings", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);

  const created = asTestChild(
    await director.createChild({
      name: "班级校验幼儿",
      birthDate: "2023-02-03",
      gender: "女",
      className: "  晨曦班  ",
    })
  );
  assert.equal(created.className, "晨曦班");
  assert.equal(created.classId, "class-morning");

  await assert.rejects(
    () => director.updateChild(created.id, { className: "   " }),
    assertApiError("invalid_request")
  );
});

test("teacher management is director-only and supports archive restore metadata", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);
  const teacher = new AppDataService(demoUser("u-teacher"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const token = `E02 Teacher ${Date.now()}`;

  await assert.rejects(() => teacher.listTeachers(), assertApiError("forbidden_scope"));
  await assert.rejects(() => parent.listTeachers(), assertApiError("forbidden_scope"));

  const created = asTestTeacher(await director.createTeacher({
    name: token,
    className: "向阳班",
  }));

  assert.ok(created.teacherId);
  assert.equal(created.name, token);

  const updated = asTestTeacher(await director.updateTeacher(created.teacherId, {
    name: `${token} Updated`,
    className: "晨曦班",
    archivedAt: "client-forged-archive",
  }));

  assert.equal(updated.name, `${token} Updated`);
  assert.equal(updated.className, "晨曦班");
  assert.equal(updated.archivedAt, undefined);

  const archived = asTestTeacher(await director.archiveTeacher(created.teacherId, "archive", "unit-test"));
  assert.ok(archived.archivedAt);
  assert.equal(archived.archivedBy, "u-admin");
  assert.equal(archived.archiveReason, "unit-test");

  const activeOnly = await director.listTeachers();
  assert.equal(activeOnly.some((item) => asTestTeacher(item).teacherId === created.teacherId), false);

  const restored = asTestTeacher(await director.archiveTeacher(created.teacherId, "restore"));
  assert.equal(restored.archivedAt, undefined);
  assert.equal(restored.restoredBy, "u-admin");
});

test("parents may create health material metadata but cannot forge parse results", async () => {
  const repo = new MemoryRepository();
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const material = await parent.createHealthMaterial({
    childId: "c-1",
    filename: "parent-upload.pdf",
    fileType: "application/pdf",
    parseStatus: "completed",
    parseResult: { riskLevel: "high", forged: true },
    parseError: "client-controlled",
  });

  assert.equal(material.parseStatus, "pending");
  assert.equal(material.parseResult, undefined);
  assert.equal(material.parseError, undefined);
  await assert.rejects(
    () => parent.updateHealthMaterial(material.materialId, { parseStatus: "completed", parseResult: { fake: true } }),
    assertApiError("forbidden_scope")
  );
});

test("E03 director summary and trend use scoped real records", async () => {
  const repo = new MemoryRepository();
  const service = new AppDataService(demoUser("u-admin"), repo);

  const summary = await service.getAdminSummary();
  assert.ok(summary.childCount >= 3);
  assert.ok(summary.teacherCount >= 2);
  assert.ok(Array.isArray(summary.classStats));
  assert.ok(Array.isArray(summary.sourceRecordIds));
  assert.equal(summary.recent7DayTrend.series.length, 7);
  assert.equal(summary.recent7DayTrend.dataQuality.source, "app-data-service");

  const trend = await service.getTrends({ metric: "meal", timeRange: "7d" });
  assert.equal(trend.metric, "meal");
  assert.equal(trend.series.length, 7);
  assert.equal(trend.dataQuality.fallback, false);
});

test("E03 weekly reports persist, export, share, archive, and enforce scope", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);

  const created = await director.createWeeklyReport({
    scopeType: "institution",
    scopeId: demoUser("u-admin").institutionId,
    periodStart: "2026-04-27",
    periodEnd: "2026-05-03",
    title: "E03 weekly report",
  });

  assert.equal(created.status, "draft");
  assert.ok(created.sourceRecordIds.length > 0);

  const listed = await director.listWeeklyReports();
  assert.ok(listed.some((report) => report.reportId === created.reportId));

  const exported = await director.exportWeeklyReportData(created.reportId, "markdown");
  assert.equal(exported.format, "markdown");
  assert.match(exported.content, /E03 weekly report/);
  assert.equal(exported.storageObject.storageMode, "metadata_only");
  assert.equal(exported.storageObject.url, null);
  assert.equal(exported.storageObject.permissions.canDownload, true);

  const shared = await director.shareWeeklyReport(created.reportId);
  assert.equal(shared?.status, "shared");
  assert.ok(shared?.share?.shareId);
  assert.equal(shared?.share?.storageObject?.storageMode, "metadata_only");
  assert.equal(shared?.share?.storageObject?.url, null);
  assert.equal(shared?.share?.storageObject?.permissions.canShare, true);

  const archived = await director.setWeeklyReportArchived(created.reportId, "archive");
  assert.equal(archived?.status, "archived");
  assert.ok(archived?.archivedBy);
  assert.equal((await director.listWeeklyReports()).some((report) => report.reportId === created.reportId), false);
  assert.equal((await director.listWeeklyReports({ includeArchived: true })).some((report) => report.reportId === created.reportId), true);

  await assert.rejects(() => parent.getScopedWeeklyReport(created.reportId), assertApiError("forbidden_scope"));
  await assert.rejects(() => parent.exportWeeklyReportData(created.reportId, "json"), assertApiError("forbidden_scope"));
  await assert.rejects(() => parent.shareWeeklyReport(created.reportId), assertApiError("forbidden_scope"));
});

test("E03 attachments expose honest local demo, metadata-only, and permission-denied storage contracts", async () => {
  const repo = new MemoryRepository();
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const teacher = new AppDataService(demoUser("u-teacher"), repo);
  const token = `storage-contract-${Date.now()}`;

  const localDemo = await parent.createAttachment({
    childId: "c-1",
    kind: "image",
    fileName: `${token}.png`,
    mimeType: "image/png",
    byteSize: 68,
    localPreviewUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  assert.equal(localDemo.storageMode, "local_demo");
  assert.equal(localDemo.metadataOnly, false);
  assert.equal(localDemo.storageObject?.storageMode, "local_demo");
  assert.equal(localDemo.storageObject?.url, null);
  assert.equal(localDemo.storageObject?.permissions.canPreview, true);
  assert.equal(localDemo.storageObject?.permissions.canDownload, true);
  assert.match(localDemo.downloadUrl ?? "", /^\/api\/attachments\/.+\/content$/);

  const metadataOnly = await parent.createAttachment({
    childId: "c-1",
    kind: "pdf",
    fileName: `${token}.pdf`,
    mimeType: "application/pdf",
    byteSize: 128,
  });
  assert.equal(metadataOnly.storageMode, "metadata_only");
  assert.equal(metadataOnly.metadataOnly, true);
  assert.equal(metadataOnly.downloadUrl, undefined);
  assert.equal(metadataOnly.storageObject?.url, null);
  assert.equal(metadataOnly.storageObject?.permissions.canPreview, false);
  assert.equal(metadataOnly.storageObject?.permissions.canDownload, false);

  const listed = await parent.listAttachments({ childId: "c-1" });
  const listedLocalDemo = listed.find((item) => item.attachmentId === localDemo.attachmentId);
  assert.equal(listedLocalDemo?.storageObject?.storageMode, "local_demo");

  await assert.rejects(() => teacher.getAttachment(localDemo.attachmentId), assertApiError("forbidden_scope"));
});

test("normal accounts cannot persist Data URL attachment payloads through metadata API", async () => {
  const repo = new MemoryRepository();
  const normalParent = new AppDataService(
    { ...demoUser("u-parent"), accountKind: "normal" },
    repo
  );

  await assert.rejects(
    () =>
      normalParent.createAttachment({
        childId: "c-1",
        relatedType: "feedback",
        relatedId: "feedback-normal-data-url",
        kind: "image",
        fileName: "oversized.png",
        mimeType: "image/png",
        localPreviewUrl: `data:image/png;base64,${"A".repeat(1024)}`,
      }),
    assertApiError("invalid_request")
  );
});

test("client supplied feedback and consultation ids cannot overwrite another child", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);

  await director.createFeedback({
    feedbackId: "collision-feedback",
    childId: "c-1",
    content: "first child feedback",
  });
  await assert.rejects(
    () =>
      director.createFeedback({
        feedbackId: "collision-feedback",
        childId: "c-4",
        content: "forged overwrite",
      }),
    assertApiError("forbidden_scope")
  );

  const firstConsultation = await director.createConsultation({
    childId: "c-1",
    riskLevel: "medium",
    summary: "first child consultation",
  });
  await assert.rejects(
    () =>
      director.createConsultation({
        consultationId: firstConsultation.consultationId,
        childId: "c-4",
        riskLevel: "high",
        summary: "forged overwrite",
      }),
    assertApiError("forbidden_scope")
  );
});

test("parents cannot add internal consultation notes", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const consultation = await director.createConsultation({
    childId: "c-1",
    riskLevel: "medium",
    summary: "staff review",
  });

  await assert.rejects(
    () => parent.addConsultationNote(consultation.consultationId, { note: "forged note" }),
    assertApiError("forbidden_scope")
  );
});

test("teacher can list health material attachments by type without crossing class scope", async () => {
  const seed = createDemoSeedSnapshot("2026-05-02T00:00:00.000Z");
  const material = seed.healthMaterials.find(
    (item) => item.uploadedBy === "u-teacher2"
  );
  assert.ok(material);
  const repo = new MemoryRepository(seed);
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);

  const created = await teacher.createAttachment({
    childId: material.childId,
    relatedType: "health-material",
    relatedId: material.materialId,
    kind: "pdf",
    fileName: "health-material.pdf",
    mimeType: "application/pdf",
    byteSize: 128,
  });

  const listed = await teacher.listAttachments({
    relatedType: "health-material",
  });
  assert.ok(listed.some((item) => item.attachmentId === created.attachmentId));
  assert.ok(
    listed.every((item) =>
      seed.children.some(
        (child) =>
          child.id === item.childId &&
          child.className === demoUser("u-teacher2").className
      )
    )
  );
});

test("private meal media is scoped to staff and its canonical meal record", async () => {
  const seed = createDemoSeedSnapshot("2026-05-02T00:00:00.000Z");
  const meal = seed.meals.find((item) => item.childId === "c-1");
  assert.ok(meal);
  const repo = new MemoryRepository(seed);
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const parent = new AppDataService(demoUser("u-parent"), repo);
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    process.env.BLOB_READ_WRITE_TOKEN = "test-private-blob-token";
    const scope = await teacher.authorizeAttachmentUpload({
      childId: "c-1",
      relatedType: "meal",
      relatedId: meal.id,
    });
    assert.deepEqual(scope, {
      childId: "c-1",
      relatedType: "meal",
      relatedId: meal.id,
    });

    const uploaded = await teacher.createUploadedAttachment(
      {
        uploadRequestId: "attachment-request-meal-photo-01",
        contentSha256: "a".repeat(64),
        childId: "c-1",
        relatedType: "meal",
        relatedId: meal.id,
        fileName: "meal-photo.png",
        mimeType: "image/png",
        byteSize: 68,
      },
      {
        storageProvider: "vercel_blob",
        storageKey:
          "smartchildcare/private-media/v1/institution/child/meal-photo.png",
        storageEtag: "meal-photo-etag",
      }
    );
    assert.equal(uploaded.storageMode, "object_storage");
    assert.equal(uploaded.uploadStatus, "uploaded");
    assert.equal(
      uploaded.uploadRequestId,
      "attachment-request-meal-photo-01"
    );
    assert.equal(
      uploaded.downloadUrl,
      `/api/attachments/${uploaded.attachmentId}/content`
    );
    const replayIdentity = {
      uploadRequestId: "attachment-request-meal-photo-01",
      contentSha256: "a".repeat(64),
      childId: "c-1",
      relatedType: "meal" as const,
      relatedId: meal.id,
      fileName: "meal-photo.png",
      mimeType: "image/png",
      byteSize: 68,
    };
    const foundReplay =
      await teacher.findUploadedAttachmentByRequestId(replayIdentity);
    assert.equal(foundReplay?.attachmentId, uploaded.attachmentId);
    const concurrentReplay = await teacher.createUploadedAttachment(
      replayIdentity,
      {
        storageProvider: "vercel_blob",
        storageKey:
          "smartchildcare/private-media/v1/institution/child/duplicate.png",
        storageEtag: "duplicate-etag",
      }
    );
    assert.equal(concurrentReplay.attachmentId, uploaded.attachmentId);
    assert.equal(concurrentReplay.storageKey, uploaded.storageKey);
    await assert.rejects(
      () =>
        teacher.findUploadedAttachmentByRequestId({
          ...replayIdentity,
          contentSha256: "b".repeat(64),
        }),
      assertApiError("conflict")
    );
    const updatedMeal = await teacher.updateRecord("meal", meal.id, {
      photoUrls: [
        uploaded.downloadUrl,
        "https://tracker.example/private-child-photo.png",
        "data:image/png;base64,unsafe-snapshot-payload",
      ],
    });
    assert.deepEqual(
      (updatedMeal as { photoUrls?: string[] } | undefined)?.photoUrls,
      [uploaded.downloadUrl]
    );

    await assert.rejects(
      () =>
        parent.authorizeAttachmentUpload({
          childId: "c-1",
          relatedType: "meal",
          relatedId: meal.id,
        }),
      assertApiError("forbidden_scope")
    );
  } finally {
    if (typeof previousToken === "string") {
      process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    } else {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  }
});

test("E03 weekly report keeps scoped provenance when selected period is empty", async () => {
  const repo = new MemoryRepository();
  const director = new AppDataService(demoUser("u-admin"), repo);

  const created = await director.createWeeklyReport({
    scopeType: "institution",
    scopeId: demoUser("u-admin").institutionId,
    periodStart: "2035-01-01",
    periodEnd: "2035-01-07",
    title: "E03 empty period weekly report",
  });
  const payload = created.payload as {
    summary: { recordCount: number };
    trend: { sourceRecordIds: string[]; emptyReason?: string };
    sourceRecordIds: string[];
    dataQuality: { sparse: boolean };
  };

  assert.equal(payload.summary.recordCount, 0);
  assert.equal(payload.trend.sourceRecordIds.length, 0);
  assert.ok(payload.trend.emptyReason);
  assert.equal(payload.dataQuality.sparse, true);
  assert.deepEqual(created.sourceRecordIds, payload.sourceRecordIds);
  assert.ok(created.sourceRecordIds.length > 0);
});
