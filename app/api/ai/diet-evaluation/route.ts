import { NextResponse } from "next/server";
import {
  requestDashscopeDietEvaluation,
  resolveBailianRuntimeConfig,
  type DietEvaluationInput,
  type DietEvaluationResult,
} from "@/lib/ai/dashscope";
import {
  attestAiResult,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import {
  forwardBrainRequest,
  shouldAcceptRemoteResponse,
} from "@/lib/server/brain-client";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { logSecurityEvent } from "@/lib/server/security-log";

interface DietEvaluationPayload {
  childId?: string;
  input: DietEvaluationInput;
}

type DietEvaluationSource = "ai" | "fallback";

function isValidFoodItem(item: unknown) {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.category === "string" && typeof obj.amount === "string";
}

function isValidInput(input: unknown): input is DietEvaluationInput {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;

  if (typeof obj.childName !== "string" || typeof obj.ageText !== "string" || typeof obj.ageBand !== "string") {
    return false;
  }
  if (typeof obj.mealType !== "string") return false;
  if (!Array.isArray(obj.mealFoods) || !obj.mealFoods.every(isValidFoodItem)) return false;
  if (
    !Array.isArray(obj.todayMeals) ||
    !obj.todayMeals.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).meal === "string" &&
        Array.isArray((item as Record<string, unknown>).foods) &&
        ((item as Record<string, unknown>).foods as unknown[]).every(isValidFoodItem)
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(obj.recentMeals) ||
    !obj.recentMeals.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).date === "string" &&
        typeof (item as Record<string, unknown>).meal === "string" &&
        Array.isArray((item as Record<string, unknown>).foods) &&
        ((item as Record<string, unknown>).foods as unknown[]).every(isValidFoodItem)
    )
  ) {
    return false;
  }

  return true;
}

function calcSimpleScore(foods: Array<{ category: string }>, waterMl: number) {
  if (foods.length === 0) return 0;
  const categories = new Set(foods.map((item) => item.category));
  const categoryScore = Math.min(categories.size * 22, 66);
  const diversityScore = Math.min(foods.length * 8, 24);
  const hydrationScore = Math.min(Math.round(waterMl / 20), 10);
  return Math.min(categoryScore + diversityScore + hydrationScore, 100);
}

function scoreComment(score: number) {
  if (score >= 85) return "营养结构较均衡，继续保持当前搭配。";
  if (score >= 70) return "整体达标，建议再提高蔬果和饮水的连续性。";
  return "结构仍有优化空间，建议补充蔬果与优质蛋白。";
}

function buildFallbackEvaluation(input: DietEvaluationInput): DietEvaluationResult {
  const mealScore = calcSimpleScore(input.mealFoods, input.todayMeals.find((item) => item.meal === input.mealType)?.waterMl ?? 0);

  const allTodayFoods = input.todayMeals.flatMap((item) => item.foods);
  const todayWater = input.todayMeals.reduce((sum, item) => sum + item.waterMl, 0);
  const todayScore = calcSimpleScore(allTodayFoods, todayWater);

  const byDate = new Map<string, { foods: Array<{ category: string }>; waterMl: number }>();
  input.recentMeals.forEach((item) => {
    const existing = byDate.get(item.date);
    if (!existing) {
      byDate.set(item.date, { foods: [...item.foods], waterMl: item.waterMl });
      return;
    }
    byDate.set(item.date, {
      foods: [...existing.foods, ...item.foods],
      waterMl: existing.waterMl + item.waterMl,
    });
  });

  const recentScores = Array.from(byDate.values()).map((day) => calcSimpleScore(day.foods, day.waterMl));
  const recentScore = recentScores.length > 0 ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length) : todayScore;

  return {
    mealScore,
    mealComment: scoreComment(mealScore),
    todayScore,
    todayComment: scoreComment(todayScore),
    recentScore,
    recentComment: scoreComment(recentScore),
    suggestions: [
      `${input.ageBand}阶段建议每餐尽量覆盖主食、蛋白与蔬果三类。`,
      "把饮水分散到上午、午后和晚餐后，避免一次性补水。",
      "若连续两餐蔬果不足，可在加餐中补充水果或蒸蔬菜。",
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isValidDietEvaluationResult(
  value: unknown
): value is DietEvaluationResult {
  if (!isRecord(value)) return false;

  const scores = [
    value.mealScore,
    value.todayScore,
    value.recentScore,
  ];
  const comments = [
    value.mealComment,
    value.todayComment,
    value.recentComment,
  ];
  return (
    scores.every(
      (score) =>
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 100
    ) &&
    comments.every((comment) => Boolean(readString(comment))) &&
    Array.isArray(value.suggestions) &&
    value.suggestions.length > 0 &&
    value.suggestions.every((suggestion) => Boolean(readString(suggestion)))
  );
}

function buildAttestedEvaluation(
  evaluation: DietEvaluationResult,
  metadata: {
    childId?: string;
    source: DietEvaluationSource;
    provider: string;
    model: string;
    fallbackReason?: string | null;
  },
  context: AiProvenanceContext
) {
  const live = metadata.source === "ai";
  return attestAiResult(
    {
      ...evaluation,
      ...(metadata.childId ? { childId: metadata.childId } : {}),
      generatedAt: new Date().toISOString(),
      source: metadata.source,
      provider: metadata.provider,
      model: metadata.model,
      live,
      fallback: !live,
      realProvider: live,
      ...(metadata.fallbackReason
        ? { fallbackReason: metadata.fallbackReason }
        : {}),
    },
    context
  );
}

async function attestRemoteDietResponse(
  response: Response,
  childId: string | undefined,
  context: AiProvenanceContext
) {
  const body = (await response.clone().json().catch(() => null)) as unknown;
  // 上游“请求成功”不代表业务结构完整；残缺评分若被签名，页面会保存后再解引用崩溃。
  if (!isRecord(body) || !isValidDietEvaluationResult(body.evaluation)) {
    return null;
  }

  const source: DietEvaluationSource =
    body.source === "ai" ? "ai" : "fallback";
  const model =
    readString(body.model) ||
    (source === "ai" ? "remote-diet-model" : "diet-rule-fallback");
  const provider =
    readString(body.provider) ||
    (source === "ai" ? "remote-brain" : "local-rules");
  const evaluation = buildAttestedEvaluation(
    body.evaluation as unknown as DietEvaluationResult,
    {
      childId,
      source,
      provider,
      model,
      fallbackReason: readString(body.fallbackReason) || null,
    },
    context
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      ...body,
      evaluation,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    }
  );
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    allowUnscoped: true,
    requireScopedNormalSession: true,
  });
  if (authResult instanceof Response) return authResult;

  const configuredModel = process.env.AI_DIET_MODEL?.trim() || resolveBailianRuntimeConfig().model;
  let payload: DietEvaluationPayload | null = null;

  try {
    payload = (await request.clone().json()) as DietEvaluationPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.diet_evaluation.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !payload ||
    !isValidInput(payload.input) ||
    (Object.prototype.hasOwnProperty.call(payload, "childId") &&
      (typeof payload.childId !== "string" || !payload.childId.trim()))
  ) {
    return NextResponse.json({ error: "Invalid diet evaluation payload" }, { status: 400 });
  }
  const childId = payload.childId?.trim() || undefined;
  const provenanceContext: AiProvenanceContext = {
    userId: authResult.session.user.id,
    institutionId: authResult.session.user.institutionId,
    capability: "diet-evaluation",
    scopeId: childId ?? null,
  };

  const brainForward = await forwardBrainRequest(request, "/api/v1/multimodal/diet-evaluation");
  const remoteResponseAccepted =
    brainForward.response?.ok &&
    (await shouldAcceptRemoteResponse(
      brainForward.response,
      authResult.session.user.accountKind
    ));
  if (brainForward.response && remoteResponseAccepted) {
    const attestedRemoteResponse = await attestRemoteDietResponse(
      brainForward.response,
      childId,
      provenanceContext
    );
    if (attestedRemoteResponse) {
      return attestedRemoteResponse;
    }
  }
  const rejectedRemoteResult = Boolean(brainForward.response);
  const remoteFallbackReason = brainForward.response
    ? brainForward.response.ok
      ? "brain-untrusted-result"
      : `brain-status-${brainForward.response.status}`
    : brainForward.fallbackReason;

  const fallback = buildFallbackEvaluation(payload.input);

  if (process.env.NODE_ENV !== "production" && request.headers.get("x-ai-force-fallback") === "1") {
    const fallbackReason = rejectedRemoteResult
      ? remoteFallbackReason
      : "forced-local-fallback";
    return NextResponse.json(
      {
        evaluation: buildAttestedEvaluation(
          fallback,
          {
            childId,
            source: "fallback",
            provider: "local-rules",
            model: "diet-rule-fallback",
            fallbackReason,
          },
          provenanceContext
        ),
        source: "fallback",
        model: "diet-rule-fallback",
        fallbackReason,
      },
      { status: 200 }
    );
  }

  const aiResult = await requestDashscopeDietEvaluation(payload.input);
  if (!aiResult) {
    logSecurityEvent("warn", "ai.diet_evaluation.fallback", {
      provider: "dashscope",
      model: configuredModel,
    });
    const fallbackReason = rejectedRemoteResult
      ? remoteFallbackReason
      : brainForward.fallbackReason ?? "dashscope-provider-unavailable";
    return NextResponse.json(
      {
        evaluation: buildAttestedEvaluation(
          fallback,
          {
            childId,
            source: "fallback",
            provider: "local-rules",
            model: "diet-rule-fallback",
            fallbackReason,
          },
          provenanceContext
        ),
        source: "fallback",
        model: "diet-rule-fallback",
        fallbackReason,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      evaluation: buildAttestedEvaluation(
        aiResult,
        {
          childId,
          source: "ai",
          provider: "dashscope",
          model: configuredModel,
        },
        provenanceContext
      ),
      source: "ai",
      model: configuredModel,
    },
    { status: 200 }
  );
}
