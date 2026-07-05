import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import {
  buildLocalHighRiskConsultationResult,
  isValidHighRiskConsultationPayload,
} from "@/lib/agent/high-risk-consultation-local-result";
import { buildAiProviderTrace, type AiProviderTrace } from "@/lib/ai/provider-trace";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import { buildHighRiskConsultationPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";

type ProviderTrace = AiProviderTrace;

type StreamEvent =
  | { event: "status"; data: Record<string, unknown> }
  | { event: "text"; data: Record<string, unknown> }
  | { event: "ui"; data: Record<string, unknown> }
  | { event: "error"; data: Record<string, unknown> }
  | { event: "done"; data: Record<string, unknown> };

const HIGH_RISK_CONSULTATION_STREAM_TARGET_PATH = "/api/v1/agents/consultations/high-risk/stream";
const DEFAULT_HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS = 8_000;
const DEFAULT_HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS = 24_000;
const HIGH_RISK_CONSULTATION_BROWSER_BUDGET_MS = 28_000;

function encodeEvent(event: StreamEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function mergeHeaders(base: HeadersInit, extra?: HeadersInit) {
  const headers = new Headers(base);
  if (!extra) return headers;

  new Headers(extra).forEach((value, key) => {
    headers.set(key, value);
  });

  return headers;
}

function sseHeaders(extraHeaders?: HeadersInit) {
  return mergeHeaders(
    {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
    extraHeaders
  );
}

function streamResponse(events: StreamEvent[], status = 200, extraHeaders?: HeadersInit) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let index = 0;
        const push = () => {
          if (index >= events.length) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(encodeEvent(events[index])));
          index += 1;
          setTimeout(push, 80);
        };
        push();
      },
    }),
    {
      status,
      headers: sseHeaders(extraHeaders),
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function buildScriptOnlyTtsTrace() {
  return {
    providerName: "text-only-tts-fallback",
    capability: "tts",
    state: "fallback",
    configured: false,
    live: false,
    fallback: true,
    mock: false,
    status: "provider-unavailable",
    reason: "High-risk consultation stream returns narration script only; no TTS audio is generated.",
    requiredEnv: [],
    warnings: ["Use a dedicated TTS endpoint when audio output is required."],
  };
}

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getHighRiskConsultationBrainTimeoutMs() {
  return readPositiveIntEnv(
    "HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS",
    DEFAULT_HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS
  );
}

function getHighRiskConsultationStreamDoneTimeoutMs(brainForward: BrainForwardResult) {
  const configured = readPositiveIntEnv(
    "HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS",
    DEFAULT_HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS
  );
  const elapsedBeforeRemoteStream = brainForward.elapsedMs ?? 0;
  const remainingBrowserBudget = Math.max(
    1_000,
    HIGH_RISK_CONSULTATION_BROWSER_BUDGET_MS - elapsedBeforeRemoteStream
  );
  return Math.min(configured, remainingBrowserBudget);
}

function sanitizeReasonToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "unknown";
}

function getTraceId(value: unknown) {
  const traceId = typeof value === "string" && value.trim() ? value.trim() : "";
  return traceId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSummaryCard(
  result: Record<string, unknown>,
  memoryMeta: Record<string, unknown>,
  providerTrace: ProviderTrace
) {
  const coordinatorSummary = asRecord(result.coordinatorSummary);
  const continuityNotes = asStringArray(result.continuityNotes);
  const triggerReasons = asStringArray(result.triggerReasons);
  const keyFindings = asStringArray(result.keyFindings);

  return {
    stage: "long_term_profile",
    title: String(result.summary ? "会诊总览" : "会诊摘要"),
    summary: String(result.summary ?? coordinatorSummary.finalConclusion ?? ""),
    content: String(coordinatorSummary.finalConclusion ?? result.parentMessageDraft ?? ""),
    items: [...continuityNotes.slice(0, 2), ...triggerReasons.slice(0, 2), ...keyFindings.slice(0, 2)].filter(Boolean),
    providerTrace,
    memoryMeta,
  };
}

function buildLongTermItems(result: Record<string, unknown>, memoryMeta: Record<string, unknown>) {
  const continuityNotes = asStringArray(result.continuityNotes);
  const usedSources = asStringArray(memoryMeta.usedSources);
  const matchedSnapshots = asStringArray(memoryMeta.matchedSnapshotIds);
  const matchedTraces = asStringArray(memoryMeta.matchedTraceIds);

  return [
    ...continuityNotes.slice(0, 2),
    ...usedSources.slice(0, 2).map((item) => `memory source: ${item}`),
    ...matchedSnapshots.slice(0, 1).map((item) => `snapshot: ${item}`),
    ...matchedTraces.slice(0, 1).map((item) => `trace: ${item}`),
  ].filter(Boolean);
}

function buildRecentItems(result: Record<string, unknown>) {
  return [
    ...asStringArray(result.triggerReasons).slice(0, 2),
    ...asStringArray(result.keyFindings).slice(0, 2),
    ...asStringArray(result.nextCheckpoints).slice(0, 2),
  ].filter(Boolean);
}

function buildFollowUpCard(result: Record<string, unknown>, providerTrace: ProviderTrace) {
  const interventionCard = asRecord(result.interventionCard);
  return {
    title: String(interventionCard.title ?? "48 小时复查"),
    items: [
      String(interventionCard.todayInSchoolAction ?? ""),
      String(interventionCard.tonightHomeAction ?? ""),
      ...asStringArray(result.followUp48h).slice(0, 2),
    ].filter(Boolean),
    reviewIn48h: String(interventionCard.reviewIn48h ?? result.reviewIn48h ?? ""),
    providerTrace,
  };
}

function buildLocalStreamHeaders(brainForward: BrainForwardResult, fallbackReason?: string) {
  return createBrainTransportHeaders({
    transport: "next-stream-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: fallbackReason ?? brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

function buildForcedStreamHeaders(fallbackReason: string) {
  return createBrainTransportHeaders({
    transport: "next-stream-fallback",
    targetPath: HIGH_RISK_CONSULTATION_STREAM_TARGET_PATH,
    fallbackReason,
  });
}

function buildRemoteStreamHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "remote-brain-proxy",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
  });
}

function buildFallbackStreamEvents(
  payload: HighRiskConsultationRequestPayload,
  traceId: string,
  fallbackReason: string,
  message = "已切换本地会诊兜底：远端 AI 会诊暂不可用，正在生成可解释本地方案。"
): StreamEvent[] {
  const result = buildLocalHighRiskConsultationResult({
    payload,
    fallbackReason,
    transport: "next-stream-fallback",
    consultationSource: "stream-terminal-fallback",
    priorityReason: "AI stream did not finish in time; local fallback generated a complete 48-hour review plan.",
  });
  const fallbackProviderTrace: ProviderTrace = buildAiProviderTrace({
    source: "local-rules-fallback",
    provider: "local-rules-llm",
    model: "local-social-emotional-rules",
    requestId: "",
    mode: "fallback",
    capability: "llm",
    transport: "next-stream-fallback",
    transportSource: "next-server",
    fallbackReason,
    fallback: true,
    realProvider: false,
    extra: {
      consultationSource: "stream-terminal-fallback",
      brainProvider: "next-fallback",
      tts: buildScriptOnlyTtsTrace(),
      modes: {
        llm: "fallback",
        tts: "fallback",
      },
    },
  });
  const resultTrace = asRecord(result?.providerTrace);
  const providerTrace =
    Object.keys(resultTrace).length > 0 ? (resultTrace as ProviderTrace) : fallbackProviderTrace;
  const memoryMeta = asRecord(result?.memoryMeta);

  if (!result) {
    return [
      {
        event: "error",
        data: {
          stage: "current_recommendation",
          title: "会诊兜底未完成",
          message,
          traceId,
        },
      },
      {
        event: "done",
        data: {
          traceId,
          result: {},
          providerTrace,
          memoryMeta,
          realProvider: false,
          fallback: true,
        },
      },
    ];
  }

  const longTermItems = buildLongTermItems(result, memoryMeta);
  const recentItems = buildRecentItems(result);
  const currentItems = [
    ...asStringArray(result.todayInSchoolActions).slice(0, 2),
    ...asStringArray(result.tonightAtHomeActions).slice(0, 2),
    ...asStringArray(result.followUp48h).slice(0, 2),
  ].filter(Boolean);

  return [
    {
      event: "status",
      data: {
        stage: "long_term_profile",
        title: "AI 辅助会诊进行中",
        message: "AI 辅助会诊进行中：正在读取长期画像和历史线索。",
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "long_term_profile",
        title: "长期画像",
        text: longTermItems.join("、") || String(result.summary ?? ""),
        items: longTermItems,
        append: false,
        source: providerTrace.source ?? "local-rules-fallback",
      },
    },
    {
      event: "ui",
      data: {
        stage: "long_term_profile",
        cardType: "ConsultationSummaryCard",
        data: buildSummaryCard(result, memoryMeta, providerTrace),
      },
    },
    {
      event: "status",
      data: {
        stage: "recent_context",
        title: "已切换本地会诊兜底",
        message,
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "recent_context",
        title: "最近会诊",
        text: recentItems.join("、") || String(asRecord(result.coordinatorSummary).finalConclusion ?? ""),
        items: recentItems,
        append: false,
        source: providerTrace.source ?? "local-rules-fallback",
      },
    },
    {
      event: "status",
      data: {
        stage: "current_recommendation",
        title: "证据链生成完成",
        message: "证据链生成完成：已生成园内行动、家庭任务和 48 小时复查建议。",
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "current_recommendation",
        title: "当前建议",
        text: String(result.summary ?? asRecord(result.coordinatorSummary).finalConclusion ?? ""),
        items: currentItems,
        append: false,
        source: providerTrace.source ?? "local-rules-fallback",
      },
    },
    {
      event: "ui",
      data: {
        stage: "current_recommendation",
        cardType: "FollowUp48hCard",
        data: buildFollowUpCard(result, providerTrace),
      },
    },
    {
      event: "done",
      data: {
        traceId,
        result,
        providerTrace,
        memoryMeta,
        realProvider: false,
        fallback: true,
      },
    },
  ];
}

function parseSseEventName(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
}

function isSseResponse(response: Response) {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream");
}

function createRemoteStreamWithDoneFallback(params: {
  response: Response;
  payload: HighRiskConsultationRequestPayload;
  traceId: string;
  brainForward: BrainForwardResult;
}) {
  const { response, payload, traceId, brainForward } = params;
  const remoteBody = response.body;
  const watchdogMs = getHighRiskConsultationStreamDoneTimeoutMs(brainForward);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (!remoteBody) {
    return streamResponse(
      buildFallbackStreamEvents(payload, traceId, "brain-stream-empty-body"),
      200,
      buildLocalStreamHeaders(brainForward, "brain-stream-empty-body")
    );
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = remoteBody.getReader();
        let buffer = "";
        let closed = false;
        let doneSeen = false;
        let fallbackStarted = false;

        const close = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };

        const appendFallback = async (fallbackReason: string, message?: string) => {
          if (closed || doneSeen || fallbackStarted) return;
          fallbackStarted = true;
          await reader.cancel().catch(() => undefined);
          if (buffer.trim()) {
            controller.enqueue(encoder.encode("\n\n"));
            buffer = "";
          }
          for (const event of buildFallbackStreamEvents(payload, traceId, fallbackReason, message)) {
            controller.enqueue(encoder.encode(encodeEvent(event)));
          }
          close();
        };

        const watchdog = setTimeout(() => {
          void appendFallback(
            "brain-stream-done-timeout",
            "已切换本地会诊兜底：远端 AI 会诊流超过时限仍未返回完成事件。"
          );
        }, watchdogMs);

        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (closed) return;
            if (done) break;

            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";

            for (const chunk of chunks) {
              if (parseSseEventName(chunk) !== "done") continue;
              doneSeen = true;
              clearTimeout(watchdog);
              await reader.cancel().catch(() => undefined);
              close();
              return;
            }
          }

          clearTimeout(watchdog);
          if (!doneSeen) {
            await appendFallback(
              "brain-stream-ended-without-done",
              "已切换本地会诊兜底：远端 AI 会诊流提前结束但未返回完成结果。"
            );
            return;
          }
          close();
        } catch (error) {
          clearTimeout(watchdog);
          if (fallbackStarted || closed) return;
          const fallbackReason =
            error instanceof Error
              ? `brain-stream-read-${sanitizeReasonToken(error.name || "error")}`
              : "brain-stream-read-error";
          await appendFallback(
            fallbackReason,
            "已切换本地会诊兜底：远端 AI 会诊流读取失败，正在生成本地结果。"
          );
        } finally {
          clearTimeout(watchdog);
        }
      },
    }),
    {
      status: 200,
      headers: sseHeaders(buildRemoteStreamHeaders(brainForward)),
    }
  );
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "staff" });
  if (authResult instanceof Response) return authResult;

  let payload: HighRiskConsultationRequestPayload;
  try {
    payload = (await request.clone().json()) as HighRiskConsultationRequestPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: mergeHeaders(
        { "Content-Type": "application/json" },
        buildForcedStreamHeaders("invalid-json-body")
      ),
    });
  }

  if (!isValidHighRiskConsultationPayload(payload)) {
    return new Response(JSON.stringify({ error: "Invalid high-risk consultation payload" }), {
      status: 400,
      headers: mergeHeaders(
        { "Content-Type": "application/json" },
        buildForcedStreamHeaders("invalid-high-risk-consultation-payload")
      ),
    });
  }

  const sessionScope = await getSessionScope(authResult.session);
  try {
    requireScopedChild(sessionScope, payload.targetChildId);
  } catch (error) {
    if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
      return aiRouteLimitedResponse({
        reason: "forbidden_child",
        error: "Current account cannot access this child consultation scope.",
        requiredRole: "staff",
      });
    }
    throw error;
  }
  payload = buildHighRiskConsultationPayloadFromScope(payload, sessionScope);
  const serviceScope = buildServiceScopeClaim(sessionScope);
  const traceId = getTraceId(asRecord(payload).traceId);
  const forcedFallback = request.headers.get("x-ai-force-fallback") === "1";
  if (forcedFallback) {
    const fallbackReason = "forced-local-fallback";
    return streamResponse(
      buildFallbackStreamEvents(payload, traceId, fallbackReason),
      200,
      buildForcedStreamHeaders(fallbackReason)
    );
  }

  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload),
  });
  const brainForward = await forwardBrainRequest(brainRequest, HIGH_RISK_CONSULTATION_STREAM_TARGET_PATH, {
    timeoutMs: getHighRiskConsultationBrainTimeoutMs(),
    serviceScope,
  });

  if (brainForward.response && isSseResponse(brainForward.response)) {
    return createRemoteStreamWithDoneFallback({
      response: brainForward.response,
      payload,
      traceId,
      brainForward,
    });
  }

  const fallbackReason = brainForward.response
    ? "brain-stream-non-sse-response"
    : brainForward.fallbackReason ?? "brain-proxy-unavailable";
  return streamResponse(
    buildFallbackStreamEvents(payload, traceId, fallbackReason),
    200,
    buildLocalStreamHeaders(brainForward, fallbackReason)
  );
}
