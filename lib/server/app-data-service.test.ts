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
    () => teacher2.createRecord("health", { childId: "c-1", remark: deniedToken }),
    assertApiError("forbidden_scope")
  );

  const visibleRecords = await teacher.listRecords("health", { childId: "c-1", includeArchived: true });
  assert.equal(visibleRecords.some((record) => asTestRecord(record).remark === deniedToken), false);
});

test("record create/read/update/archive persists through the repository", async () => {
  const repo = new MemoryRepository();
  const service = new AppDataService(demoUser("u-teacher"), repo);
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
    parentUserId: "u-parent",
  }));

  assert.ok(created.id);
  assert.equal(created.institutionId, "inst-1");

  const parent = new AppDataService(demoUser("u-parent"), repo);
  assert.equal(asTestChild(await parent.getChild(created.id)).id, created.id);

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
  assert.equal(updated.archivedAt, undefined);

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
  });

  assert.equal(material.parseStatus, "pending");
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

  const shared = await director.shareWeeklyReport(created.reportId);
  assert.equal(shared?.status, "shared");
  assert.ok(shared?.share?.shareId);

  const archived = await director.setWeeklyReportArchived(created.reportId, "archive");
  assert.equal(archived?.status, "archived");
  assert.ok(archived?.archivedBy);
  assert.equal((await director.listWeeklyReports()).some((report) => report.reportId === created.reportId), false);
  assert.equal((await director.listWeeklyReports({ includeArchived: true })).some((report) => report.reportId === created.reportId), true);

  await assert.rejects(() => parent.getScopedWeeklyReport(created.reportId), assertApiError("forbidden_scope"));
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
