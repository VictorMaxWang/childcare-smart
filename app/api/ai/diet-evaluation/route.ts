import { NextResponse } from "next/server";
import { requestDashscopeDietEvaluation, type DietEvaluationInput, type DietEvaluationResult } from "@/lib/ai/dashscope";

interface DietEvaluationPayload {
  input: DietEvaluationInput;
}

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

export async function POST(request: Request) {
  const configuredModel = process.env.AI_DIET_MODEL || process.env.AI_MODEL || "qwen-turbo";
  let payload: DietEvaluationPayload | null = null;

  try {
    payload = (await request.json()) as DietEvaluationPayload;
  } catch (error) {
    console.error("[AI] Invalid diet-evaluation payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || !isValidInput(payload.input)) {
    return NextResponse.json({ error: "Invalid diet evaluation payload" }, { status: 400 });
  }

  const fallback = buildFallbackEvaluation(payload.input);

  if (process.env.NODE_ENV !== "production" && request.headers.get("x-ai-force-fallback") === "1") {
    return NextResponse.json(
      {
        evaluation: fallback,
        source: "fallback",
        model: "diet-rule-fallback",
      },
      { status: 200 }
    );
  }

  const aiResult = await requestDashscopeDietEvaluation(payload.input);
  if (!aiResult) {
    console.warn(`[AI] Falling back to diet evaluation rules using model ${configuredModel}.`);
    return NextResponse.json(
      {
        evaluation: fallback,
        source: "fallback",
        model: "diet-rule-fallback",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      evaluation: aiResult,
      source: "ai",
      model: configuredModel,
    },
    { status: 200 }
  );
}
