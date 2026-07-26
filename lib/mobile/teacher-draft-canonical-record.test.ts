import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalTeacherDraftRecord } from "@/lib/mobile/teacher-draft-canonical-record";
import type { TeacherDraftRecord } from "@/lib/mobile/teacher-draft-records";

function draft(
  category: TeacherDraftRecord["category"],
  structuredFields: Record<string, unknown>
): TeacherDraftRecord {
  return {
    recordId: `draft-${category}`,
    childId: "c-1",
    childName: "林小雨",
    category,
    summary: "午餐只吃了一半，饮水 180ml，需要继续观察",
    rawExcerpt: "林小雨午餐只吃了一半，饮水 180ml",
    confidence: 0.9,
    structuredFields,
    suggestedActions: ["下午补水并复查"],
    warnings: [],
    status: "pending",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

test("teacher voice diet draft becomes a canonical meal record", () => {
  const result = buildCanonicalTeacherDraftRecord(
    draft("DIET", {
      meal_period: "lunch",
      appetite: "low",
      hydration: "mentioned",
      food_items: ["米饭", "蔬菜"],
    }),
    "2026-07-25"
  );

  assert.equal(result.type, "meal");
  if (result.type !== "meal") return;
  assert.equal(result.input.meal, "午餐");
  assert.equal(result.input.intakeLevel, "少量");
  assert.equal(result.input.waterMl, 180);
  assert.deepEqual(
    result.input.foods?.map((item) => item.name),
    ["米饭", "蔬菜"]
  );
});

test("teacher voice health and leave drafts map to scoped records", () => {
  const health = buildCanonicalTeacherDraftRecord(
    {
      ...draft("HEALTH", {
        temperature_c: 38.2,
        symptoms: ["咳嗽"],
        severity_hint: "high",
      }),
      summary: "体温 38.2 度并伴随咳嗽",
    },
    "2026-07-25"
  );
  const leave = buildCanonicalTeacherDraftRecord(
    {
      ...draft("LEAVE", { leave_type: "sick_leave" }),
      summary: "发热病假，家长已接回",
    },
    "2026-07-25"
  );

  assert.equal(health.type, "health");
  if (health.type === "health") {
    assert.equal(health.input.temperature, 38.2);
    assert.equal(health.input.isAbnormal, true);
  }
  assert.equal(leave.type, "attendance");
  if (leave.type === "attendance") {
    assert.equal(leave.input.isPresent, false);
    assert.match(leave.input.absenceReason ?? "", /病假/);
  }
});

test("teacher voice emotion and sleep drafts become growth records", () => {
  const emotion = buildCanonicalTeacherDraftRecord(
    {
      ...draft("EMOTION", { mood: "anxious" }),
      summary: "午睡前焦虑，安抚后有所改善",
    },
    "2026-07-25"
  );
  const sleep = buildCanonicalTeacherDraftRecord(
    {
      ...draft("SLEEP", { sleep_quality: "interrupted" }),
      summary: "午睡中途惊醒",
    },
    "2026-07-25"
  );

  assert.equal(emotion.type, "growth");
  assert.equal(sleep.type, "growth");
  if (emotion.type === "growth") {
    assert.equal(emotion.input.category, "情绪表现");
    assert.equal(emotion.input.needsAttention, true);
  }
  if (sleep.type === "growth") {
    assert.equal(sleep.input.category, "睡眠情况");
    assert.equal(sleep.input.needsAttention, true);
  }
});
