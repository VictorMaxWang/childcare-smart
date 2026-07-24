import assert from "node:assert/strict";
import test from "node:test";

import type { ParentTrendQueryResponse } from "@/lib/ai/types";
import type { VivoChatResult } from "@/lib/providers/vivo";
import { enhanceParentTrendWithVivo } from "./parent-trend-vivo.ts";

function baseResponse(): ParentTrendQueryResponse {
  return {
    query: {
      question: "最近一周成长情况如何？",
      resolvedWindowDays: 7,
    },
    intent: "growth_overall",
    metric: "overall_growth_score",
    child: {},
    windowDays: 7,
    range: { startDate: "2026-07-18", endDate: "2026-07-24" },
    labels: ["2026-07-24"],
    xAxis: ["07/24"],
    series: [],
    trendLabel: "稳定",
    trendScore: 86,
    comparison: {
      baselineAvg: 84,
      recentAvg: 86,
      deltaPct: 2.4,
      direction: "up",
    },
    explanation: "本地趋势解释。",
    supportingSignals: [],
    dataQuality: {
      observedDays: 3,
      coverageRatio: 0.43,
      sparse: false,
      fallbackUsed: true,
      source: "request_snapshot",
    },
    warnings: ["AI provider 不可用，已降级为本地趋势解释。", "记录覆盖有限。"],
    source: "request_snapshot",
    mode: "fallback",
    provider: "next-local-trend-fallback",
    fallback: true,
    fallbackReason: "brain-status-503",
  };
}

function vivoResult(text: string): VivoChatResult {
  return {
    text,
    providerName: "vivo",
    model: "deepseek-v3-2-251201",
    state: "live",
    live: true,
    fallback: false,
    mock: false,
    isRealProvider: true,
    requestId: "request-1",
    warnings: [],
    status: {
      providerName: "vivo",
      capability: "chat",
      state: "live",
      configured: true,
      live: true,
      fallback: false,
      mock: false,
      supported: true,
      isRealProvider: true,
      status: "ready",
      warnings: [],
      requiredEnv: [],
    },
  };
}

test("Vivo enhances server-computed trend data without changing its metrics", async () => {
  const base = baseResponse();
  const result = await enhanceParentTrendWithVivo(base, {
    requestChat: async () =>
      vivoResult(
        JSON.stringify({
          explanation: "最近一周的记录总体稳定，后半段分数略有上升，可继续保持当前观察节奏。",
          warnings: ["当前记录覆盖 3 天，结论仍需结合后续连续记录。"],
        })
      ),
  });

  assert.ok(result);
  assert.equal(result.fallback, false);
  assert.equal(result.mode, "live");
  assert.equal(result.provider, "vivo");
  assert.equal(result.trendScore, base.trendScore);
  assert.deepEqual(result.comparison, base.comparison);
  assert.equal(result.dataQuality.fallbackUsed, false);
  assert.equal(result.providerTrace?.model, "deepseek-v3-2-251201");
  assert.equal(result.providerTrace?.realProvider, true);
  assert.ok(!result.warnings.some((warning) => warning.includes("provider 不可用")));
});

test("invalid Vivo output keeps the deterministic fallback available", async () => {
  const result = await enhanceParentTrendWithVivo(baseResponse(), {
    requestChat: async () => vivoResult("not-json"),
  });

  assert.equal(result, null);
});
