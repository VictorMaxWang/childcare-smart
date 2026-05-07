import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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

  assert.equal(snapshot.growth.length, 36 * 6);
  assert.equal(snapshot.meals.length, 36 * 7 * 4);
  assert.equal(snapshot.health.length, 36 * 7);
  assert.equal(snapshot.healthMaterials.length, 36);
  assert.equal(snapshot.storybooks.length, 36);
  assert.equal(snapshot.weeklyReports.length, 4);
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
