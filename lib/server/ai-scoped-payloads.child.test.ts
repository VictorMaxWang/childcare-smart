import assert from "node:assert/strict";
import test from "node:test";
import { buildChildSuggestionSnapshotFromScope } from "./ai-scoped-payloads";
import type { SessionScope } from "./session-scope";

function scope(birthDate: string): SessionScope {
  return {
    visibleChildren: [{ id: "authorized-child", name: "合成儿童", birthDate, ageBand: "24-36m" }],
    scopedSnapshot: { health: [], meals: [], growth: [], feedback: [] },
  } as unknown as SessionScope;
}

test("trusted parent snapshot derives real age from the saved birth date, overriding a stale client band", () => {
  const result = buildChildSuggestionSnapshotFromScope(scope("2026-02-28"), "authorized-child", "2026-10-31");
  assert.equal(result?.child.ageBandContext?.ageMonths, 8);
  assert.equal(result?.child.ageBandContext?.normalizedAgeBand, "0-12m");
  assert.equal(result?.child.ageBandContext?.source, "birthDate");
  assert.equal(result?.child.ageBand, "0-12月");
});

test("trusted age context remains child scoped and preserves older toddler boundaries", () => {
  assert.equal(buildChildSuggestionSnapshotFromScope(scope("2024-08-31"), "authorized-child", "2026-10-31")?.child.ageBandContext?.normalizedAgeBand, "24-36m");
  assert.equal(buildChildSuggestionSnapshotFromScope(scope("2024-08-31"), "foreign-child", "2026-10-31"), null);
});

test("trusted suggestion input projects legacy positive feedback as observations without mutating stored facts", () => {
  const input = scope("2026-02-28");
  input.scopedSnapshot.feedback = [{ childId: "authorized-child", feedbackId: "feedback-a", date: "2026-10-31", barriers: ["情绪稳定", "需要提醒", "今晚没时间"], notes: "原有备注" }] as unknown as typeof input.scopedSnapshot.feedback;
  const before = JSON.stringify(input);
  const result = buildChildSuggestionSnapshotFromScope(input, "authorized-child", "2026-10-31");
  assert.ok(result);
  assert.ok(result.recentDetails);
  const feedback = result.recentDetails.feedback[0];
  assert.deepEqual(feedback.barriers, ["今晚没时间"]);
  assert.match(feedback.notes, /观察到：情绪稳定/u);
  assert.match(feedback.notes, /支持需求：需要提醒/u);
  assert.equal(JSON.stringify(input), before);
});
