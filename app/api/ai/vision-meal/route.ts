import { NextResponse } from "next/server";
import { requestDashscopeMealVision, type VisionDetectedFood } from "@/lib/ai/dashscope";
import { forwardBrainRequest } from "@/lib/server/brain-client";

interface VisionMealPayload {
  imageDataUrl: string;
}

function isValidPayload(payload: unknown): payload is VisionMealPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return typeof obj.imageDataUrl === "string" && obj.imageDataUrl.trim().length > 0;
}

function buildFallbackFoods(): VisionDetectedFood[] {
  return [
    { name: "米饭", category: "主食", amount: "1碗" },
    { name: "青菜", category: "蔬果", amount: "60g" },
    { name: "鸡肉", category: "蛋白", amount: "70g" },
  ];
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/multimodal/vision-meal");
  if (brainForward.response) return brainForward.response;

  const configuredModel = process.env.AI_VISION_MODEL || "qwen3-vl-plus";
  let payload: VisionMealPayload | null = null;

  try {
    payload = (await request.json()) as VisionMealPayload;
  } catch (error) {
    console.error("[AI] Invalid vision-meal payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid vision payload" }, { status: 400 });
  }

  const fallbackFoods = buildFallbackFoods();

  if (process.env.NODE_ENV !== "production" && request.headers.get("x-ai-force-fallback") === "1") {
    return NextResponse.json(
      {
        foods: fallbackFoods,
        source: "fallback",
        model: "vision-rule-fallback",
      },
      { status: 200 }
    );
  }

  const aiFoods = await requestDashscopeMealVision(payload.imageDataUrl);
  if (!aiFoods || aiFoods.length === 0) {
    console.warn(`[AI] Falling back to vision rules using model ${configuredModel}.`);
    return NextResponse.json(
      {
        foods: fallbackFoods,
        source: "fallback",
        model: "vision-rule-fallback",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      foods: aiFoods,
      source: "ai",
      model: configuredModel,
    },
    { status: 200 }
  );
}
