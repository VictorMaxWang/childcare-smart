import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("high-risk consultation prompt guardrails are explicit", () => {
  const nextPrompt = read("lib/ai/providers/llm-provider.ts");
  const backendPrompt = read("backend/app/agents/high_risk_consultation.py");

  for (const content of [nextPrompt, backendPrompt]) {
    assert.match(content, /不是医疗诊断/);
    assert.match(content, /不要把风险贴到儿童身份上/);
    assert.match(content, /不要承诺改善结果/);
    assert.match(content, /治疗、用药/);
    assert.match(content, /人工复核/);
  }
});

test("primary high-risk surfaces avoid child-labeling copy", () => {
  const files = [
    "app/teacher/high-risk-consultation/page.tsx",
    "components/admin/pixel-replica/DirectorDashboardReplica.tsx",
    "components/teacher/TeacherWorkbenchPage.tsx",
    "lib/agent/admin-consultation.ts",
    "lib/agent/intervention-card.ts",
    "lib/consultation/evidence-display.ts",
  ];
  const unsafePatterns = [
    /高风险儿童一键会诊/,
    /高风险儿童会诊/,
    /高风险儿童/,
    /高风险孩子/,
    /异常儿童/,
    /高风险家庭干预卡/,
    /高风险预警/,
    /可直接采信/,
  ];

  for (const file of files) {
    const content = read(file);
    for (const pattern of unsafePatterns) {
      assert.doesNotMatch(content, pattern, `${file} contains unsafe copy ${pattern}`);
    }
  }
});
