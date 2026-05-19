#!/usr/bin/env node

const baseUrl = String(process.env.AI_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/ai/suggestions`;
const loginEndpoint = `${baseUrl}/api/auth/demo-login`;
const demoAccountId = process.env.AI_SMOKE_DEMO_ACCOUNT_ID || "u-parent";

const payload = {
  snapshot: {
    child: {
      id: process.env.AI_SMOKE_CHILD_ID || "c-1",
      name: "Lin Xiaoyu",
      ageBand: "3-6",
      className: "Morning Demo Class",
      allergies: [],
      specialNotes: "Authorized demo child used for final defense smoke validation.",
    },
    summary: {
      health: {
        abnormalCount: 0,
        handMouthEyeAbnormalCount: 0,
        avgTemperature: 36.7,
        moodKeywords: ["stable", "needs gentle transition"],
      },
      meals: {
        recordCount: 8,
        hydrationAvg: 480,
        balancedRate: 78,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 6,
        attentionCount: 2,
        pendingReviewCount: 1,
        topCategories: [
          { category: "confidence", count: 2 },
          { category: "transition", count: 2 },
        ],
      },
      feedback: {
        count: 3,
        statusCounts: { acknowledged: 1, completed_at_home: 2 },
        keywords: ["bedtime story", "small step", "family feedback"],
      },
    },
    ruleFallback: [
      {
        title: "Keep tonight action small",
        description: "Use one familiar story and one short transition attempt.",
        level: "warning",
        tags: ["family-action"],
      },
      {
        title: "Family feedback loop is available",
        description: "Ask the parent to record whether the child accepted the small step.",
        level: "success",
        tags: ["feedback"],
      },
    ],
  },
};

async function loginAndGetCookie() {
  const response = await fetch(loginEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: demoAccountId }),
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok || data?.ok !== true) {
    throw new Error(`login failed: ${response.status} ${rawText.slice(0, 160)}`);
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
    throw new Error(`non-json response: ${rawText.slice(0, 160)}`);
  }
  return { status: response.status, data };
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`status: ${result.status}`);
  console.log(`source: ${result.data?.source ?? "(missing)"}`);
  console.log(`provider: ${result.data?.provider ?? "(missing)"}`);
  console.log(`fallbackReason: ${result.data?.fallbackReason ?? "(missing)"}`);
  console.log(`riskLevel: ${result.data?.riskLevel ?? "(missing)"}`);
  console.log(`highlights: ${Array.isArray(result.data?.highlights) ? result.data.highlights.length : 0}`);
  console.log(`concerns: ${Array.isArray(result.data?.concerns) ? result.data.concerns.length : 0}`);
  console.log(`actions: ${Array.isArray(result.data?.actions) ? result.data.actions.length : 0}`);
}

function hasSuggestionShape(result) {
  return (
    result.status === 200 &&
    ["ai", "fallback", "mock"].includes(result.data?.source) &&
    typeof result.data?.riskLevel === "string" &&
    Array.isArray(result.data?.highlights) &&
    Array.isArray(result.data?.concerns) &&
    Array.isArray(result.data?.actions)
  );
}

async function main() {
  console.log(`AI smoke target: ${endpoint}`);
  console.log(`AI smoke demo account: ${demoAccountId}`);
  console.log(`AI smoke child: ${payload.snapshot.child.id}`);

  try {
    const cookie = await loginAndGetCookie();
    const normal = await postSuggestion(cookie);
    printResult("Normal AI path", normal);

    const fallback = await postSuggestion(cookie, { "x-ai-force-fallback": "1" });
    printResult("Forced fallback path", fallback);

    const normalOk = hasSuggestionShape(normal);
    const fallbackOk = hasSuggestionShape(fallback) && ["fallback", "mock"].includes(fallback.data?.source);

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
