import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgeBandContext } from "@/lib/age-band/policy";
import { buildParentStoryBookAgeConstraint } from "./parent-storybook-real-text";

test("an eight month infant is not prompted to perform preschool actions", () => {
  const text = buildParentStoryBookAgeConstraint({ id: "synthetic-child", name: "合成儿童",
    ageBandContext: resolveAgeBandContext({ birthDate: "2026-02-10", asOfDate: "2026-10-31" }) });
  assert.match(text, /8个月/);
  assert.match(text, /不得要求独立行走/);
  assert.match(text, /照护者陪伴共读/);
  assert.doesNotMatch(text, /3-6|三至六/);
});

test("toddler and unknown ages retain different safe constraints without inventing capabilities", () => {
  const toddler = buildParentStoryBookAgeConstraint({ id: "synthetic-child", name: "合成儿童", ageBand: "24-36月" });
  assert.match(toddler, /简单轮流与模仿/);
  assert.match(toddler, /不要求识字/);
  const unknown = buildParentStoryBookAgeConstraint({ id: "synthetic-child", name: "合成儿童" });
  assert.match(unknown, /月龄尚未核实/);
  assert.match(unknown, /不编造年龄或发展能力/);
});
