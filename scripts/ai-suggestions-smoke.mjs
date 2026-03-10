#!/usr/bin/env node

const baseUrl = String(process.env.AI_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/ai/suggestions`;
const loginEndpoint = `${baseUrl}/api/auth/login`;

const payload = {
  snapshot: {
    child: {
      id: "c-smoke",
      name: "演示幼儿",
      ageBand: "1-3岁",
      className: "向阳班",
      allergies: ["芒果"],
      specialNotes: "午睡前容易情绪波动",
    },
    summary: {
      health: {
        abnormalCount: 1,
        handMouthEyeAbnormalCount: 0,
        avgTemperature: 36.8,
        moodKeywords: ["平稳", "轻微哭闹"],
      },
      meals: {
        recordCount: 10,
        hydrationAvg: 118,
        balancedRate: 62,
        monotonyDays: 2,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 6,
        attentionCount: 2,
        pendingReviewCount: 1,
        topCategories: [
          { category: "情绪表现", count: 2 },
          { category: "社交互动", count: 2 },
        ],
      },
      feedback: {
        count: 3,
        statusCounts: { 已知晓: 1, 在家已配合: 2 },
        keywords: ["按时入睡", "饮水提醒"],
      },
    },
    ruleFallback: [
      {
        title: "饮水偏低需关注",
        description: "建议分时段增加饮水提醒。",
        level: "warning",
        tags: ["饮水"],
      },
      {
        title: "家园反馈配合良好",
        description: "继续保持家庭执行反馈节奏。",
        level: "success",
        tags: ["家园协同"],
      },
    ],
  },
};

async function loginAndGetCookie() {
  const response = await fetch(loginEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: process.env.AI_SMOKE_USER_ID || "u-teacher",
      password: process.env.AI_SMOKE_PASSWORD || "123456",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`login failed: ${response.status} ${text.slice(0, 120)}`);
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("login succeeded but set-cookie header is missing");
  }
  return cookie.split(";")[0];
}

async function postSuggestion(cookie, headers = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`non-json response: ${rawText.slice(0, 120)}`);
  }
  return { status: response.status, data };
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`status: ${result.status}`);
  console.log(`source: ${result.data?.source ?? "(missing)"}`);
  console.log(`riskLevel: ${result.data?.riskLevel ?? "(missing)"}`);
  console.log(`highlights: ${Array.isArray(result.data?.highlights) ? result.data.highlights.length : 0}`);
  console.log(`concerns: ${Array.isArray(result.data?.concerns) ? result.data.concerns.length : 0}`);
  console.log(`actions: ${Array.isArray(result.data?.actions) ? result.data.actions.length : 0}`);
}

async function main() {
  console.log(`AI smoke target: ${endpoint}`);

  try {
    const cookie = await loginAndGetCookie();
    const normal = await postSuggestion(cookie);
    printResult("Normal AI path", normal);

    const fallback = await postSuggestion(cookie, { "x-ai-force-fallback": "1" });
    printResult("Forced fallback path", fallback);

    const normalOk = normal.status === 200 && ["ai", "fallback"].includes(normal.data?.source);
    const fallbackOk = fallback.status === 200 && fallback.data?.source === "fallback";

    if (!normalOk || !fallbackOk) {
      console.error("\n[FAIL] AI smoke check did not return expected structure.");
      process.exit(1);
    }

    console.log("\n[OK] AI smoke check passed.");
  } catch (error) {
    console.error("\n[FAIL] AI smoke check request failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
