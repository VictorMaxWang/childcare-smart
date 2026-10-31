import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { matrixPlan, validateMatrixManifest } from "./parent-courses-real-matrix.mjs";

test("ordinary-account matrix covers two institutions, eight users and four children", () => {
  const actors = matrixPlan("qa-care-offline");
  assert.equal(actors.length, 8);
  assert.equal(actors.filter(actor => actor.role === "机构管理员").length, 2);
  assert.equal(actors.filter(actor => actor.role === "教师").length, 3);
  assert.equal(actors.flatMap(actor => actor.months || []).length, 4);
  const accounts = Object.fromEntries(actors.map(actor => [actor.key, { ...actor, user: { institutionId: actor.institution, accountKind: "normal" }, children: (actor.months || []).map((_, index) => ({ id: `${actor.key}-${index}` })) }]));
  validateMatrixManifest({ version: 1, baseUrl: "https://example.test", prefix: "qa-care-offline", accounts });
  const parent = actors.find(actor => actor.key === "parentA1");
  assert.equal(parent.months.length, 2);
  assert.equal(actors.find(actor => actor.key === "teacherA1").className, parent.className);
  assert.notEqual(actors.find(actor => actor.key === "teacherA2").className, parent.className);
});
test("matrix refuses a demo account or a missing synthetic child", () => {
  const accounts = Object.fromEntries(matrixPlan("qa-care-offline").map(actor => [actor.key, { ...actor, user: { institutionId: actor.institution, accountKind: "normal" }, children: (actor.months || []).map((_, index) => ({ id: `${actor.key}-${index}` })) }]));
  accounts.teacherA1.user.accountKind = "demo";
  assert.throws(() => validateMatrixManifest({ version: 1, baseUrl: "https://example.test", prefix: "qa-care-offline", accounts }));
});
test("course migration contains only repeatable additive table definitions", async () => {
  const sql = await readFile(new URL("../supabase/sql/20261031_parent_courses.sql", import.meta.url), "utf8");
  const commands = sql.replace(/--[^\n]*/gu, "").split(";").map(value => value.trim()).filter(Boolean);
  assert.equal(commands.length, 4);
  const tables = new Set();
  for (const command of commands) {
    assert.match(command, /^CREATE TABLE IF NOT EXISTS parent_course_[a-z_]+\s*\(/u);
    assert.doesNotMatch(command, /\b(?:DROP|TRUNCATE|DELETE|REPLACE|ALTER)\b/iu);
    tables.add(command.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/u)[1]);
  }
  assert.equal(tables.size, 4);
});
