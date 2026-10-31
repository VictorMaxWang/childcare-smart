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
