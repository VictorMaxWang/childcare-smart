import { NextResponse } from "next/server";
import {
  requestDashscopeMealVision,
  resolveBailianVisionModel,
  type VisionDetectedFood,
} from "@/lib/ai/dashscope";
import {
  forwardBrainRequest,
  shouldAcceptRemoteResponse,
} from "@/lib/server/brain-client";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { logSecurityEvent } from "@/lib/server/security-log";

interface VisionMealPayload {
  imageDataUrl: string;
}

const MAX_VISION_IMAGE_BYTES = 3 * 1024 * 1024;
const VISION_MEAL_TARGET = "/api/v1/multimodal/vision-meal";

export type VisionMealRouteDependencies = {
  authorize: typeof authorizeAiRouteSession;
  forwardBrain: typeof forwardBrainRequest;
  acceptRemoteResponse: typeof shouldAcceptRemoteResponse;
  requestVision: typeof requestDashscopeMealVision;
};

const defaultDependencies: VisionMealRouteDependencies = {
  authorize: authorizeAiRouteSession,
  forwardBrain: forwardBrainRequest,
  acceptRemoteResponse: shouldAcceptRemoteResponse,
  requestVision: requestDashscopeMealVision,
};

function validatePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.imageDataUrl !== "string" || !obj.imageDataUrl.trim()) {
    return { ok: false as const, status: 400, error: "Invalid vision payload" };
  }
  const match = obj.imageDataUrl.match(
    /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/iu
  );
  if (!match) {
    return {
      ok: false as const,
      status: 415,
      error: "Only base64 JPEG, PNG, or WebP images are supported.",
    };
  }
  const normalizedBase64 = match[1].replace(/\s+/gu, "");
  const payloadChars = normalizedBase64.length;
  const padding = normalizedBase64.endsWith("==") ? 2 : normalizedBase64.endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.max(0, Math.floor((payloadChars * 3) / 4) - padding);
  if (estimatedBytes > MAX_VISION_IMAGE_BYTES) {
    return {
      ok: false as const,
      status: 413,
      error: "Image exceeds the 3 MB recognition limit.",
    };
  }
  return {
    ok: true as const,
    payload: { imageDataUrl: obj.imageDataUrl } satisfies VisionMealPayload,
  };
}

function buildFallbackFoods(): VisionDetectedFood[] {
  return [
    { name: "米饭", category: "主食", amount: "1碗" },
    { name: "青菜", category: "蔬果", amount: "60g" },
    { name: "鸡肉", category: "蛋白", amount: "70g" },
  ];
}

function providerUnavailableResponse(fallbackReason: string | null) {
  return NextResponse.json(
    {
      foods: [],
      source: "unavailable",
      model: resolveBailianVisionModel(),
      fallbackReason: fallbackReason ?? "dashscope-provider-unavailable",
      code: "provider_unavailable",
      error: "图片识别服务暂时不可用，请改用手动录入。",
    },
    { status: 503 }
  );
}

export async function handleVisionMealRequest(
  request: Request,
  dependencies: VisionMealRouteDependencies = defaultDependencies
) {
  const authResult = await dependencies.authorize(request, { requiredRole: "staff" });
  if (authResult instanceof Response) return authResult;

  let rawPayload: unknown = null;
  try {
    rawPayload = await request.clone().json();
  } catch (error) {
    logSecurityEvent("error", "ai.vision_meal.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validatePayload(rawPayload);
  if (!validation) {
    return NextResponse.json({ error: "Invalid vision payload" }, { status: 400 });
  }
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }
  const payload = validation.payload;

  // 任何外部 Brain/DashScope 调用前先完成本地格式和体积校验，避免发送不合规原图。
  const brainForward = await dependencies.forwardBrain(request, VISION_MEAL_TARGET);
  const remoteResponseAccepted =
    brainForward.response?.ok &&
    (await dependencies.acceptRemoteResponse(
      brainForward.response,
      authResult.session.user.accountKind
    ));
  if (brainForward.response && remoteResponseAccepted) return brainForward.response;
  const rejectedRemoteResult = Boolean(brainForward.response);
  const remoteFallbackReason = brainForward.response
    ? brainForward.response.ok
      ? "brain-untrusted-result"
      : `brain-status-${brainForward.response.status}`
    : brainForward.fallbackReason;

  const configuredModel = resolveBailianVisionModel();
  const fallbackFoods = buildFallbackFoods();

  if (process.env.NODE_ENV !== "production" && request.headers.get("x-ai-force-fallback") === "1") {
    if (authResult.session.user.accountKind !== "demo") {
      return providerUnavailableResponse(
        rejectedRemoteResult ? remoteFallbackReason : "forced-provider-unavailable"
      );
    }
    return NextResponse.json(
      {
        foods: fallbackFoods,
        source: "fallback",
        model: "vision-rule-fallback",
        fallbackReason: rejectedRemoteResult ? remoteFallbackReason : undefined,
      },
      { status: 200 }
    );
  }

  const aiFoods = await dependencies.requestVision(payload.imageDataUrl);
  if (!aiFoods || aiFoods.length === 0) {
    logSecurityEvent("warn", "ai.vision_meal.fallback", {
      provider: "dashscope",
      model: configuredModel,
    });
    const fallbackReason = rejectedRemoteResult
      ? remoteFallbackReason
      : brainForward.fallbackReason ?? "dashscope-provider-unavailable";
    if (authResult.session.user.accountKind !== "demo") {
      return providerUnavailableResponse(fallbackReason);
    }
    return NextResponse.json(
      {
        foods: fallbackFoods,
        source: "fallback",
        model: "vision-rule-fallback",
        fallbackReason,
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

export function POST(request: Request) {
  return handleVisionMealRequest(request);
}
