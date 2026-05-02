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

function asTestRecord(record: unknown) {
  return record as TestRecord;
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
