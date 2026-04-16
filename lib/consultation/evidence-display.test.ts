import assert from "node:assert/strict";
import test from "node:test";

import type { ConsultationEvidenceItem } from "@/lib/ai/types";
import {
  buildConsultationEvidencePanelModel,
  formatConsultationEvidenceSupportLabel,
  groupConsultationEvidenceItemsByCategory,
  sortConsultationEvidenceItems,
} from "./evidence-display";

function buildEvidenceItem(
  overrides: Partial<ConsultationEvidenceItem> & Pick<ConsultationEvidenceItem, "id" | "summary">
): ConsultationEvidenceItem {
  return {
    sourceType: "teacher_note",
    sourceLabel: "教师补充",
    confidence: "medium",
    requiresHumanReview: false,
    evidenceCategory: "risk_control",
    supports: [],
    ...overrides,
    id: overrides.id,
    summary: overrides.summary,
  };
}

test("sortConsultationEvidenceItems prioritizes support type, confidence, review state, and direct sources", () => {
  const sorted = sortConsultationEvidenceItems([
    buildEvidenceItem({
      id: "action-high",
      summary: "先做园内动作",
      supports: [{ type: "action", targetId: "action:school:0", targetLabel: "园内安抚" }],
      confidence: "high",
    }),
    buildEvidenceItem({
      id: "finding-medium",
      summary: "中置信发现",
      supports: [{ type: "finding", targetId: "finding:key:1", targetLabel: "情绪波动持续" }],
      confidence: "medium",
    }),
    buildEvidenceItem({
      id: "finding-high-derived",
      summary: "推断型高置信发现",
      sourceType: "derived_explainability",
      supports: [{ type: "finding", targetId: "finding:key:2", targetLabel: "家园沟通缺口" }],
      confidence: "high",
    }),
    buildEvidenceItem({
      id: "finding-high-direct",
      summary: "直接来源高置信发现",
      supports: [{ type: "finding", targetId: "finding:key:0", targetLabel: "教师观察异常" }],
      confidence: "high",
    }),
    buildEvidenceItem({
      id: "finding-high-review",
      summary: "需要人工复核的高置信发现",
      supports: [{ type: "finding", targetId: "finding:key:3", targetLabel: "低频异常" }],
      confidence: "high",
      requiresHumanReview: true,
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    [
      "finding-high-direct",
      "finding-high-derived",
      "finding-high-review",
      "finding-medium",
      "action-high",
    ]
  );
});

test("groupConsultationEvidenceItemsByCategory keeps fixed category order", () => {
  const groups = groupConsultationEvidenceItemsByCategory([
    buildEvidenceItem({
      id: "daily",
      summary: "日常照护证据",
      evidenceCategory: "daily_care",
    }),
    buildEvidenceItem({
      id: "family",
      summary: "家庭沟通证据",
      evidenceCategory: "family_communication",
    }),
    buildEvidenceItem({
      id: "risk",
      summary: "风险控制证据",
      evidenceCategory: "risk_control",
    }),
    buildEvidenceItem({
      id: "dev",
      summary: "发展支持证据",
      evidenceCategory: "development_support",
    }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.category),
    ["risk_control", "family_communication", "daily_care", "development_support"]
  );
});

test("formatConsultationEvidenceSupportLabel keeps support semantics and target label", () => {
  assert.equal(
    formatConsultationEvidenceSupportLabel({
      type: "finding",
      targetId: "finding:key:0",
      targetLabel: "情绪波动持续",
    }),
    "支持发现·情绪波动持续"
  );

  assert.equal(
    formatConsultationEvidenceSupportLabel({
      type: "explainability",
      targetId: "explainability:0",
    }),
    "说明依据"
  );
});

test("buildConsultationEvidencePanelModel falls back from structured evidence to evidenceHighlights and explainability", () => {
  const structuredModel = buildConsultationEvidencePanelModel({
    evidenceItems: [
      buildEvidenceItem({
        id: "structured",
        summary: "老师补充孩子午休前更黏老师。",
        confidence: "high",
      }),
    ],
    evidenceHighlights: ["不应命中的兼容摘要"],
    explainability: [{ label: "关键发现", detail: "不应命中的 explainability" }],
    leadLimit: 3,
  });
  assert.equal(structuredModel.mode, "structured");
  assert.equal(structuredModel.leadItems.length, 1);
  assert.equal(structuredModel.fallbackItems.length, 0);

  const highlightFallbackModel = buildConsultationEvidencePanelModel({
    evidenceItems: [],
    evidenceHighlights: ["教师补充：老师补充孩子午休前更黏老师。"],
    explainability: [{ label: "关键发现", detail: "会被 evidenceHighlights 覆盖" }],
    leadLimit: 3,
  });
  assert.equal(highlightFallbackModel.mode, "fallback");
  assert.equal(highlightFallbackModel.fallbackItems[0]?.source, "evidenceHighlights");
  assert.equal(
    highlightFallbackModel.fallbackItems[0]?.detail,
    "教师补充：老师补充孩子午休前更黏老师。"
  );

  const explainabilityFallbackModel = buildConsultationEvidencePanelModel({
    evidenceItems: [],
    evidenceHighlights: [],
    explainability: [{ label: "关键发现", detail: "当前仍需围绕情绪波动继续复核。" }],
    leadLimit: 3,
  });
  assert.equal(explainabilityFallbackModel.mode, "fallback");
  assert.equal(explainabilityFallbackModel.fallbackItems[0]?.source, "explainability");
  assert.equal(
    explainabilityFallbackModel.fallbackItems[0]?.detail,
    "关键发现：当前仍需围绕情绪波动继续复核。"
  );
});

test("buildConsultationEvidencePanelModel keeps remainder evidence grouped by category after lead items", () => {
  const model = buildConsultationEvidencePanelModel({
    evidenceItems: [
      buildEvidenceItem({
        id: "finding-risk",
        summary: "风险控制主证据",
        confidence: "high",
        evidenceCategory: "risk_control",
        supports: [{ type: "finding", targetId: "finding:key:0", targetLabel: "情绪波动持续" }],
      }),
      buildEvidenceItem({
        id: "family",
        summary: "家庭沟通补充证据",
        evidenceCategory: "family_communication",
        supports: [{ type: "action", targetId: "action:home:0", targetLabel: "今晚沟通" }],
      }),
      buildEvidenceItem({
        id: "daily",
        summary: "日常照护补充证据",
        evidenceCategory: "daily_care",
      }),
      buildEvidenceItem({
        id: "development",
        summary: "发展支持补充证据",
        evidenceCategory: "development_support",
      }),
    ],
    leadLimit: 1,
  });

  assert.equal(model.mode, "structured");
  assert.deepEqual(
    model.leadItems.map((item) => item.item.id),
    ["finding-risk"]
  );
  assert.deepEqual(
    model.groupedRemainder.map((group) => ({
      category: group.category,
      ids: group.items.map((item) => item.item.id),
    })),
    [
      { category: "family_communication", ids: ["family"] },
      { category: "daily_care", ids: ["daily"] },
      { category: "development_support", ids: ["development"] },
    ]
  );
});
