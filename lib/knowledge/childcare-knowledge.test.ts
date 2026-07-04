import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILDCARE_KNOWLEDGE_ENTRIES,
  findChildcareKnowledgeEntries,
  getChildcareKnowledgeHints,
} from "./childcare-knowledge.ts";

test("childcare knowledge defines the eight demo topics", () => {
  assert.equal(CHILDCARE_KNOWLEDGE_ENTRIES.length, 8);
  assert.deepEqual(
    CHILDCARE_KNOWLEDGE_ENTRIES.map((entry) => entry.topic),
    ["情绪安抚", "分离焦虑", "社交退缩", "饮食睡眠", "家园沟通", "安全边界", "勇敢表达", "规则意识"]
  );
});

test("findChildcareKnowledgeEntries retrieves entries by topic", () => {
  const results = findChildcareKnowledgeEntries({
    topic: "勇敢表达",
    limit: 2,
  });

  assert.equal(results[0]?.topic, "勇敢表达");
  assert.match(results[0]?.suggestedAction ?? "", /小步骤|牵手/);
});

test("getChildcareKnowledgeHints returns a conservative fallback when there is no match", () => {
  const hints = getChildcareKnowledgeHints({
    topic: "不存在的托育主题",
    scenario: "unknown scenario",
    limit: 3,
  });

  assert.equal(hints.length, 1);
  assert.equal(hints[0]?.id, "ckb-fallback-care-boundary-v1");
  assert.match(hints[0]?.riskBoundary ?? "", /健康安全流程|专业人员/);
});

test("findChildcareKnowledgeEntries supports age range overlap", () => {
  const results = findChildcareKnowledgeEntries({
    ageRange: "24-36m",
    limit: 8,
  });
  const topics = results.map((entry) => entry.topic);

  assert.ok(topics.includes("勇敢表达"));
  assert.ok(topics.includes("情绪安抚"));
  assert.ok(results.every((entry) => entry.ageRange.endsWith("36m")));
});
