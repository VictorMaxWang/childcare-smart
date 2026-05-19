import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { DEFENSE_CHILD_PROFILES, DEFENSE_CLASS, DEFENSE_PARENT_NAME } from "@/lib/demo-data/defense-scenario";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";

const FIXED_NOW = "2026-05-07T08:00:00.000Z";

test("D-SEED creates the deterministic 36 child baseline", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);
  const childIds = new Set(snapshot.children.map((child) => child.id));
  const liChildren = snapshot.children.filter((child) => child.teacherId === "u-teacher");
  const zhouChildren = snapshot.children.filter((child) => child.teacherId === "u-teacher2");

  assert.equal(snapshot.children.length, 36);
  assert.equal(childIds.size, 36);
  assert.equal(liChildren.length, 18);
  assert.equal(zhouChildren.length, 18);
  assert.equal(liChildren.length + zhouChildren.length, snapshot.children.length);
  assert.equal(snapshot.children.filter((child) => child.classId === "class-sunrise").length, 18);
  assert.equal(snapshot.children.filter((child) => child.classId === "class-morning").length, 18);
  assert.deepEqual(
    snapshot.children
      .filter((child) => child.parentUserId === "u-parent")
      .map((child) => child.id)
      .sort(),
    ["c-1", "c-4"]
  );
});

test("D-SEED covers records, assignments, weekly reports and storybooks", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);

  assert.ok(snapshot.growth.length >= 36 * 6);
  assert.equal(snapshot.meals.length, 36 * 7 * 4);
  assert.equal(snapshot.health.length, 36 * 7);
  assert.equal(snapshot.healthMaterials.length, 36);
  assert.equal(snapshot.storybooks.length, 36);
  assert.ok(snapshot.weeklyReports.length >= 5);
  assert.equal(snapshot.nutritionMenus.length, 4 * 7 * 2);

  for (const child of snapshot.children) {
    assert.ok(child.classId, `${child.id} classId`);
    assert.ok(child.className, `${child.id} className`);
    assert.ok(child.teacherId, `${child.id} teacherId`);
    assert.ok(child.parentId, `${child.id} parentId`);
    assert.ok(snapshot.growth.filter((record) => record.childId === child.id).length >= 6, `${child.id} growth`);
    assert.ok(snapshot.meals.filter((record) => record.childId === child.id).length >= 7, `${child.id} meals`);
    assert.ok(snapshot.health.filter((record) => record.childId === child.id).length >= 7, `${child.id} health`);
    assert.ok(snapshot.healthMaterials.some((material) => material.childId === child.id), `${child.id} material`);
    assert.ok(snapshot.storybooks.some((storybook) => storybook.childId === child.id), `${child.id} storybook`);
  }

  for (const teacherId of ["u-teacher", "u-teacher2"]) {
    const teacherTasks = snapshot.tasks.filter((task) => (task as { assignedTeacherId?: string }).assignedTeacherId === teacherId);
    assert.ok(teacherTasks.length >= 12, `${teacherId} assignments`);
    assert.ok(teacherTasks.filter((task) => task.status === "completed").length >= 2, `${teacherId} completed`);
    assert.ok(teacherTasks.filter((task) => task.status === "in_progress").length >= 2, `${teacherId} in progress`);
  }
});

test("D-SEED includes the defense scenario fixture matrix", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);
  const childMap = new Map(snapshot.children.map((child) => [child.id, child] as const));

  for (const [childId, profile] of Object.entries(DEFENSE_CHILD_PROFILES)) {
    const child = childMap.get(childId);
    assert.ok(child, `${childId} exists`);
    assert.equal(child?.name, profile.name);
    assert.equal(child?.classId, DEFENSE_CLASS.classId);
    assert.equal(child?.className, DEFENSE_CLASS.className);
    assert.equal(child?.teacherId, DEFENSE_CLASS.teacherId);
  }

  assert.equal(childMap.get("c-1")?.guardians[0]?.name, DEFENSE_PARENT_NAME);
  assert.equal(childMap.get("c-4")?.guardians[0]?.name, DEFENSE_PARENT_NAME);
  assert.ok(snapshot.health.some((record) => record.childId === "c-2" && record.isAbnormal && record.remark?.includes("离园前")));
  assert.ok(snapshot.meals.some((record) => record.childId === "c-3" && record.meal === "午餐" && record.intakeLevel === "少量"));
  assert.ok(snapshot.growth.some((record) => record.id === "growth-defense-c-3-diet-followup" && record.description.includes("补充饮食观察")));
  assert.ok(snapshot.healthMaterials.some((material) => material.childId === "c-5" && material.parseStatus === "pending"));
  assert.ok(snapshot.growth.some((record) => record.childId === "c-6" && record.description.includes("主动把喜欢的小车分享给同伴")));
  assert.ok(snapshot.feedback.some((item) => item.childId === "c-1" && item.content.includes("孩子能复述故事")));
  assert.ok(snapshot.tasks.some((task) => task.taskId === "task-defense-c-2-review-48h" && task.status === "in_progress"));
  assert.ok(snapshot.reminders.some((reminder) => reminder.reminderId === "reminder-defense-c-1-tonight-action"));
  assert.ok(snapshot.messages.some((message) => message.childId === "c-2" && message.content.includes("主动饮水偏少") && message.readBy.length === 0));
  assert.ok(snapshot.weeklyReports.some((report) => report.reportId === "weekly-report-defense-morning"));
  assert.ok(snapshot.storybooks.some((storybook) => storybook.childId === "c-1" && storybook.pages.some((page) => page.title === "林小雨的一小步勇敢")));

  const priorityConsultations = snapshot.consultations.filter((consultation) => consultation.shouldEscalateToAdmin);
  assert.ok(priorityConsultations.length >= 3);
  assert.ok(priorityConsultations.some((consultation) => consultation.childId === "c-1"));
  assert.ok(priorityConsultations.some((consultation) => consultation.childId === "c-2"));
  assert.ok(priorityConsultations.some((consultation) => consultation.childId === "c-3"));
  const xiaoyuConsultation = priorityConsultations.find((consultation) => consultation.childId === "c-1");
  assert.equal(xiaoyuConsultation?.riskLevel, "high");
  assert.equal(xiaoyuConsultation?.directorDecisionCard.recommendedOwnerRole, "admin");
  assert.equal(xiaoyuConsultation?.directorDecisionCard.recommendedOwnerName, "陈园长");
  assert.ok((xiaoyuConsultation?.evidenceItems.length ?? 0) >= 4);
  assert.ok(xiaoyuConsultation?.evidenceItems.some((item) => item.sourceLabel === "教师观察"));
  assert.ok(xiaoyuConsultation?.evidenceItems.some((item) => item.sourceLabel === "成长记录"));
  assert.ok(xiaoyuConsultation?.evidenceItems.some((item) => item.sourceLabel === "家长反馈"));
  assert.ok(xiaoyuConsultation?.evidenceItems.some((item) => item.sourceLabel === "记忆快照 / 历史跟进"));
  assert.ok((xiaoyuConsultation?.todayInSchoolActions.length ?? 0) > 0);
  assert.ok((xiaoyuConsultation?.tonightAtHomeActions.length ?? 0) > 0);
  assert.ok((xiaoyuConsultation?.followUp48h.length ?? 0) > 0);
});

test("D-SEED storybooks and media refs have safe local fallbacks", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);
  const manifestPath = path.join(process.cwd(), "public", "demo-media", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    fallbacks: Record<string, string>;
    assets: Array<{ path: string; fallbackPath: string }>;
  };

  for (const assetPath of [...Object.values(manifest.fallbacks), ...manifest.assets.flatMap((asset) => [asset.path, asset.fallbackPath])]) {
    assert.equal(assetPath.startsWith("/demo-media/"), true, assetPath);
    assert.equal(fs.existsSync(path.join(process.cwd(), "public", assetPath)), true, assetPath);
  }

  assert.ok(snapshot.meals.every((record) => record.mediaRefs?.[0] || record.photoUrls?.[0]));
  assert.ok(snapshot.healthMaterials.every((material) => Array.isArray(material.parseResult?.mediaRefs)));
  assert.ok(
    snapshot.storybooks.every((storybook) =>
      storybook.pages.every((page) => typeof page.fallbackMediaRef === "string" || page.response)
    )
  );
});
