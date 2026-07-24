import {
  requestDashscopeSuggestion,
  resolveBailianRuntimeConfig,
} from "@/lib/ai/dashscope";

// 只发送合成快照并输出非敏感元数据，便于发布前验证模型权限和端点可用性。
const result = await requestDashscopeSuggestion({
  child: {
    id: "bailian-smoke-child",
    name: "Smoke",
  },
  summary: {
    health: {
      abnormalCount: 0,
      handMouthEyeAbnormalCount: 0,
      moodKeywords: [],
    },
    meals: {
      recordCount: 1,
      hydrationAvg: 220,
      balancedRate: 80,
      monotonyDays: 0,
      allergyRiskCount: 0,
    },
    growth: {
      recordCount: 1,
      attentionCount: 0,
      pendingReviewCount: 0,
      topCategories: [],
    },
    feedback: {
      count: 0,
      statusCounts: {},
      keywords: [],
    },
  },
  recentDetails: {
    health: [],
    meals: [],
    growth: [],
    feedback: [],
  },
  ruleFallback: [],
});

const config = resolveBailianRuntimeConfig();
let endpointHost = "invalid";
try {
  endpointHost = new URL(config.endpoint).host;
} catch {
  // 无效端点只通过状态暴露，避免把完整配置写入日志。
}

console.log(
  JSON.stringify({
    ok: Boolean(result),
    provider: "dashscope",
    model: config.model,
    endpointHost,
    timeoutMs: config.timeoutMs,
  })
);

if (!result) process.exitCode = 1;
