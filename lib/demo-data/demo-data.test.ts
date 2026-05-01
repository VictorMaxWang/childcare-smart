import assert from "node:assert/strict";
import test from "node:test";

import {
  createConsultation,
  createDailyRecord,
  createHealthMaterial,
  createMemoryDemoStorage,
  failHealthParseResult,
  getCurrentDemoContext,
  getParentHomeData,
  addConsultationNote,
  listConsultations,
  listHealthMaterials,
  listMessages,
  parseHealthMaterial,
  replyMessage,
  resetDemoData,
  saveConsultationResult,
  sendMessage,
  updateConsultationStatus,
  updateHealthMaterialParseStatus,
} from "@/lib/demo-data/index";
import { isRenderableConsultationApiResult } from "@/lib/consultation/trace-types";

function buildContexts() {
  const storage = createMemoryDemoStorage();
  const now = () => "2026-05-01T08:00:00.000Z";
  const parent = getCurrentDemoContext("parent", { storage, now });
  const teacher = getCurrentDemoContext("teacher", { storage, now });
  const teacher2 = getCurrentDemoContext("teacher2", { storage, now });
  const director = getCurrentDemoContext("director", { storage, now });
  resetDemoData(parent);
  return { storage, now, parent, teacher, teacher2, director };
}

test("D01 seed initializes once and later reads do not overwrite new messages", () => {
  const { parent, teacher } = buildContexts();
  const token = "D01 seed persistence token";

  const sent = sendMessage({ context: parent, childId: "c-1", content: token });
  assert.equal(sent.status, "local_only");
  assert.ok(listMessages(teacher).some((message) => message.content === token));

  const refreshedTeacher = getCurrentDemoContext("teacher", {
    storage: teacher.storage,
    now: teacher.now,
  });
  assert.ok(listMessages(refreshedTeacher).some((message) => message.content === token));
});

test("D01 message reply is visible to parent and teacher", () => {
  const { parent, teacher } = buildContexts();
  const parentToken = "D01 parent message";
  const teacherToken = "D01 teacher reply";

  const sent = sendMessage({ context: parent, childId: "c-1", content: parentToken });
  const messageId = sent.data?.messageId;
  assert.ok(messageId);

  const reply = replyMessage({ context: teacher, messageId, content: teacherToken });
  assert.equal(reply.status, "local_only");

  assert.ok(listMessages(parent).some((message) => message.content === teacherToken));
  assert.ok(listMessages(teacher).some((message) => message.content === teacherToken));
});

test("D01 daily record appears in parent home data", () => {
  const { parent, teacher } = buildContexts();
  const token = "D01 morning check visible";

  const result = createDailyRecord({
    context: teacher,
    childId: "c-1",
    type: "morning-check",
    payload: { remark: token, temperature: 36.7 },
  });
  assert.equal(result.status, "local_only");

  const home = getParentHomeData("c-1", parent);
  assert.ok(home.dailyRecords.some((record) => record.type === "morning-check" && record.payload.remark === token));
});

test("D01 health material parse result persists across context refresh", () => {
  const { parent, teacher } = buildContexts();
  const created = createHealthMaterial({
    context: teacher,
    childId: "c-1",
    filename: "lab-report.pdf",
    fileType: "pdf",
  });
  const materialId = created.data?.materialId;
  assert.ok(materialId);

  parseHealthMaterial({
    context: teacher,
    materialId,
    parseResult: { summary: "D01 parsed health material" },
  });

  const refreshedParent = getCurrentDemoContext("parent", {
    storage: parent.storage,
    now: parent.now,
  });
  const materials = listHealthMaterials("c-1", refreshedParent);
  assert.equal(materials[0]?.parseStatus, "completed");
  assert.equal(materials[0]?.parseResult?.summary, "D01 parsed health material");
});

test("D05 health material parse task tracks processing, completion and failure", () => {
  const { parent, teacher } = buildContexts();
  const created = createHealthMaterial({
    context: teacher,
    childId: "c-1",
    filename: "d05-health-note.pdf",
    fileType: "pdf",
    description: "D05 material description",
  });
  const materialId = created.data?.materialId;
  assert.ok(materialId);
  assert.equal(created.data?.parseStatus, "pending");

  const processing = updateHealthMaterialParseStatus({
    context: teacher,
    materialId,
    status: "processing",
  });
  assert.equal(processing.data?.parseStatus, "processing");

  const completed = parseHealthMaterial({
    context: teacher,
    materialId,
    parseResult: {
      summary: "D05 completed local parse",
      sourceLabel: "本地演示解析",
      riskItems: [{ title: "D05 high risk", severity: "high" }],
    },
  });
  assert.equal(completed.data?.parseStatus, "completed");
  assert.equal(completed.data?.parseResult?.sourceLabel, "本地演示解析");

  const refreshedParent = getCurrentDemoContext("parent", {
    storage: parent.storage,
    now: parent.now,
  });
  assert.equal(listHealthMaterials("c-1", refreshedParent)[0]?.parseStatus, "completed");

  const failed = failHealthParseResult({
    context: teacher,
    materialId,
    error: "D05 forced failure",
  });
  assert.equal(failed.data?.parseStatus, "failed");
  assert.equal(failed.data?.parseError, "D05 forced failure");
});

test("D01 consultation is visible to director and scoped away from unrelated teacher", () => {
  const { teacher, teacher2, director } = buildContexts();
  const result = createConsultation({
    context: teacher,
    childId: "c-1",
    riskLevel: "high",
    notes: "D01 high risk consultation",
  });
  assert.equal(result.status, "local_only");
  const consultationId = result.data?.consultationId;
  assert.ok(consultationId);

  assert.ok(listConsultations(director).some((item) => item.consultationId === consultationId));
  assert.equal(listConsultations(teacher2).some((item) => item.consultationId === consultationId), false);
});

test("D05 consultation result, notes and workflow status persist across roles", () => {
  const { parent, teacher, teacher2, director } = buildContexts();
  const base = createConsultation({
    context: teacher,
    childId: "c-1",
    riskLevel: "high",
    notes: "D05 high risk consultation",
    workflowStatus: "pending",
  });
  const consultation = base.data;
  assert.ok(consultation);
  assert.equal(isRenderableConsultationApiResult(consultation), true);

  const saved = saveConsultationResult({
    context: teacher,
    childId: "c-1",
    consultation,
    workflowStatus: "pending",
  });
  assert.equal((saved.data as { workflowStatus?: string } | undefined)?.workflowStatus, "pending");

  const note = addConsultationNote({
    context: teacher,
    consultationId: consultation.consultationId,
    note: "D05 consultation note persists",
  });
  assert.equal(note.status, "local_only");

  const status = updateConsultationStatus({
    context: teacher,
    consultationId: consultation.consultationId,
    status: "in-progress",
  });
  assert.equal((status.data as { workflowStatus?: string } | undefined)?.workflowStatus, "in-progress");
  assert.equal(status.data?.directorDecisionCard.status, "in_progress");

  assert.ok(listConsultations(director).some((item) => item.consultationId === consultation.consultationId));
  assert.ok(listConsultations(parent).some((item) => item.consultationId === consultation.consultationId));
  assert.equal(listConsultations(teacher2).some((item) => item.consultationId === consultation.consultationId), false);

  const refreshedTeacher = getCurrentDemoContext("teacher", {
    storage: teacher.storage,
    now: teacher.now,
  });
  const refreshed = listConsultations(refreshedTeacher).find(
    (item) => item.consultationId === consultation.consultationId
  ) as { workflowStatus?: string; notes?: Array<{ note?: string }> } | undefined;
  assert.equal(refreshed?.workflowStatus, "in-progress");
  assert.ok(refreshed?.notes?.some((item) => item.note === "D05 consultation note persists"));
});

test("D01 rejects unauthorized child mutation and leaves parent home unchanged", () => {
  const { parent } = buildContexts();
  const beforeCount = getParentHomeData("c-1", parent).dailyRecords.length;
  const result = createDailyRecord({
    context: parent,
    childId: "c-2",
    type: "growth",
    payload: { description: "parent should not write c-2" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error, "unauthorized_child_id");
  assert.equal(getParentHomeData("c-1", parent).dailyRecords.length, beforeCount);
});
