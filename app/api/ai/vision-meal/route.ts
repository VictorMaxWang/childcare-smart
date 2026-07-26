import { NextResponse } from "next/server";
import {
  requestDashscopeMealVision,
  resolveBailianVisionModel,
  type VisionDetectedFood,
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
import {
  inspectBase64Media,
  readRequestWithBodyLimit,
  UploadSecurityError,
} from "@/lib/server/upload-security";

interface VisionMealPayload {
  imageDataUrl: string;
  childId?: string;
}

const MAX_VISION_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VISION_REQUEST_BYTES =
  Math.ceil(MAX_VISION_IMAGE_BYTES / 3) * 4 + 64 * 1024;
const VISION_MEAL_TARGET = "/api/v1/multimodal/vision-meal";
const VISION_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
    /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/iu
  );
  if (!match) {
    return {
      ok: false as const,
      status: 415,
      error: "Only base64 JPEG, PNG, or WebP images are supported.",
    };
  }
  try {
    inspectBase64Media({
      base64: match[2],
      claimedMimeType: match[1],
      allowedMimeTypes: VISION_IMAGE_MIME_TYPES,
      maxBytes: MAX_VISION_IMAGE_BYTES,
    });
  } catch (error) {
    if (!(error instanceof UploadSecurityError)) throw error;
    return {
      ok: false as const,
      status: error.status,
      error:
        error.status === 413
          ? "Image exceeds the 3 MB recognition limit."
          : error.message,
    };
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, "childId") &&
    (typeof obj.childId !== "string" || !obj.childId.trim())
  ) {
    return {
      ok: false as const,
      status: 400,
      error: "Invalid child scope.",
    };
  }
  return {
    ok: true as const,
    payload: {
      imageDataUrl: obj.imageDataUrl,
      ...(typeof obj.childId === "string"
        ? { childId: obj.childId.trim() }
        : {}),
    } satisfies VisionMealPayload,
  };
}

function buildFallbackFoods(): VisionDetectedFood[] {
  return [
    { name: "米饭", category: "主食", amount: "1碗" },
    { name: "青菜", category: "蔬果", amount: "60g" },
    { name: "鸡肉", category: "蛋白", amount: "70g" },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function buildAttestedVisionResult(
  input: Record<string, unknown>,
  context: AiProvenanceContext,
  childId?: string
) {
  const source = input.source === "ai" ? "ai" : "fallback";
  const fallback =
    typeof input.fallback === "boolean"
      ? input.fallback
      : source !== "ai";
  const live =
    typeof input.live === "boolean"
      ? input.live && !fallback
      : source === "ai" && !fallback;
  const provider =
    readString(input.provider) ||
    (live ? "dashscope" : "local-rules");
  const model =
    readString(input.model) ||
    (live ? resolveBailianVisionModel() : "vision-rule-fallback");
  const provenance = {
    ...(childId ? { childId } : {}),
    source,
    provider,
    model,
    live,
    fallback,
    realProvider: live && !fallback,
  };
  const foods = Array.isArray(input.foods)
    ? input.foods.map((food) =>
        isRecord(food)
          ? attestAiResult(
              {
                ...food,
                ...provenance,
              },
              context
            )
          : food
      )
    : [];

  return attestAiResult(
    {
      ...input,
      ...provenance,
      foods,
    },
    context
  );
}

async function attestVisionResponse(
  response: Response,
  context: AiProvenanceContext,
  childId?: string
) {
  const body = (await response.clone().json().catch(() => null)) as unknown;
  if (!isRecord(body)) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify(buildAttestedVisionResult(body, context, childId)),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    }
  );
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
  let boundedRequest: Request;
  try {
    // 鉴权守卫会读取 JSON 以提取 child scope，因此必须先把原始正文变成有硬上限的请求。
    boundedRequest = await readRequestWithBodyLimit(
      request,
      MAX_VISION_REQUEST_BYTES
    );
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }

  const authResult = await dependencies.authorize(boundedRequest, { requiredRole: "staff" });
  if (authResult instanceof Response) return authResult;

  let rawPayload: unknown = null;
  try {
    rawPayload = await boundedRequest.clone().json();
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
  const provenanceContext: AiProvenanceContext = {
    userId: authResult.session.user.id,
    institutionId: authResult.session.user.institutionId,
    capability: "vision-meal",
    scopeId: payload.childId ?? null,
  };

  // 任何外部 Brain/DashScope 调用前先完成本地格式和体积校验，避免发送不合规原图。
  const brainForward = await dependencies.forwardBrain(boundedRequest, VISION_MEAL_TARGET);
  const remoteResponseAccepted =
    brainForward.response?.ok &&
    (await dependencies.acceptRemoteResponse(
      brainForward.response,
      authResult.session.user.accountKind
    ));
  if (brainForward.response && remoteResponseAccepted) {
    return attestVisionResponse(
      brainForward.response,
      provenanceContext,
      payload.childId
    );
  }
  const rejectedRemoteResult = Boolean(brainForward.response);
  const remoteFallbackReason = brainForward.response
    ? brainForward.response.ok
      ? "brain-untrusted-result"
      : `brain-status-${brainForward.response.status}`
    : brainForward.fallbackReason;

  const configuredModel = resolveBailianVisionModel();
  const fallbackFoods = buildFallbackFoods();

  if (process.env.NODE_ENV !== "production" && boundedRequest.headers.get("x-ai-force-fallback") === "1") {
    if (authResult.session.user.accountKind !== "demo") {
      return providerUnavailableResponse(
        rejectedRemoteResult ? remoteFallbackReason : "forced-provider-unavailable"
      );
    }
    return NextResponse.json(
      buildAttestedVisionResult({
        ...(payload.childId ? { childId: payload.childId } : {}),
        foods: fallbackFoods,
        source: "fallback",
        provider: "local-rules",
        model: "vision-rule-fallback",
        live: false,
        fallback: true,
        realProvider: false,
        fallbackReason: rejectedRemoteResult ? remoteFallbackReason : undefined,
      }, provenanceContext, payload.childId),
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
      buildAttestedVisionResult({
        ...(payload.childId ? { childId: payload.childId } : {}),
        foods: fallbackFoods,
        source: "fallback",
        provider: "local-rules",
        model: "vision-rule-fallback",
        live: false,
        fallback: true,
        realProvider: false,
        fallbackReason,
      }, provenanceContext, payload.childId),
      { status: 200 }
    );
  }

  return NextResponse.json(
    buildAttestedVisionResult({
      ...(payload.childId ? { childId: payload.childId } : {}),
      foods: aiFoods,
      source: "ai",
      provider: "dashscope",
      model: configuredModel,
      live: true,
      fallback: false,
      realProvider: true,
    }, provenanceContext, payload.childId),
    { status: 200 }
  );
}

export function POST(request: Request) {
  return handleVisionMealRequest(request);
}
