import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  readBrainTransportHeaders,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import { normalizeHighRiskConsultationResult } from "@/lib/consultation/normalize-result";

type ProviderTrace = {
  provider?: string;
  source?: string;
  model?: string;
  requestId?: string;
  transport?: string;
  transportSource?: string;
  consultationSource?: string;
  fallbackReason?: string;
  brainProvider?: string;
  realProvider?: boolean;
  fallback?: boolean;
  [key: string]: unknown;
};

type StreamEvent =
  | { event: "status"; data: Record<string, unknown> }
  | { event: "text"; data: Record<string, unknown> }
  | { event: "ui"; data: Record<string, unknown> }
  | { event: "error"; data: Record<string, unknown> }
  | { event: "done"; data: Record<string, unknown> };

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
      headers: mergeHeaders(
        {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
        extraHeaders
      ),
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
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
    title: String(result.summary ? "\u4f1a\u8bca\u603b\u89c8" : "\u4f1a\u8bca\u6458\u8981"),
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
    title: String(interventionCard.title ?? "48 \u5c0f\u65f6\u590d\u67e5"),
    items: [
      String(interventionCard.todayInSchoolAction ?? ""),
      String(interventionCard.tonightHomeAction ?? ""),
      ...asStringArray(result.followUp48h).slice(0, 2),
    ].filter(Boolean),
    reviewIn48h: String(interventionCard.reviewIn48h ?? result.reviewIn48h ?? ""),
    providerTrace,
  };
}

function buildLocalStreamHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "next-stream-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

function buildTerminalFallback(traceId: string, fallbackReason: string, message: string): StreamEvent[] {
  return [
    {
      event: "error",
      data: {
        stage: "current_recommendation",
        title: "\u4f1a\u8bca\u5931\u8d25",
        message,
        traceId,
      },
    },
    {
      event: "done",
      data: {
        traceId,
        result: {},
        providerTrace: {
          source: "unknown",
          provider: "unknown",
          model: "",
          requestId: "",
          transport: "next-stream-fallback",
          transportSource: "next-server",
          consultationSource: "next-stream-fallback",
          fallbackReason,
          brainProvider: "next-fallback",
          fallback: true,
          realProvider: false,
        },
        memoryMeta: {},
        realProvider: false,
        fallback: true,
      },
    },
  ];
}

async function buildFallbackEvents(
  payload: Record<string, unknown>,
  origin: string,
  brainForward: BrainForwardResult,
  requestHeaders?: Headers
): Promise<StreamEvent[]> {
  const traceId = getTraceId(payload.traceId);
  const cookie = requestHeaders?.get("cookie");

  let response: Response;
  try {
    response = await fetch(new URL("/api/ai/high-risk-consultation", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-debug-memory": "1",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? `local-json-fetch-${error.name.toLowerCase()}` : "local-json-fetch-error";
    return buildTerminalFallback(
      traceId,
      fallbackReason,
      "fallback request failed before a response was returned"
    );
  }

  if (!response.ok) {
    return buildTerminalFallback(
      traceId,
      `local-json-status-${response.status}`,
      `fallback request failed with status ${response.status}`
    );
  }

  const rawResult = (await response.json()) as Record<string, unknown>;
  const responseTransport = readBrainTransportHeaders(response.headers);
  const result = normalizeHighRiskConsultationResult(rawResult, {
    brainProvider: "next-fallback",
    defaultTransport: "next-stream-fallback",
    defaultTransportSource: "next-server",
    defaultConsultationSource:
      responseTransport.transport || asString(rawResult.source) || "next-json-fallback",
    defaultFallbackReason:
      brainForward.fallbackReason ||
      responseTransport.fallbackReason ||
      "brain-proxy-unavailable",
  });
  const providerTrace = asRecord(result.providerTrace) as ProviderTrace;
  const memoryMeta = asRecord(result.memoryMeta);
  const childName = String(asRecord(result.interventionCard).title ?? "\u9ad8\u98ce\u9669\u4f1a\u8bca");

  return [
    {
      event: "status",
      data: {
        stage: "long_term_profile",
        title: "\u957f\u671f\u753b\u50cf",
        message: `\u6b63\u5728\u8bfb\u53d6 ${childName} \u7684\u957f\u671f\u753b\u50cf\u548c\u8bb0\u5fc6\u4e0a\u4e0b\u6587`,
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "long_term_profile",
        title: "\u957f\u671f\u753b\u50cf",
        text: buildLongTermItems(result, memoryMeta).join("\u3001") || String(result.summary ?? ""),
        items: buildLongTermItems(result, memoryMeta),
        append: false,
        source: providerTrace.source ?? "unknown",
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
        title: "\u6700\u8fd1\u4f1a\u8bca",
        message: "\u6b63\u5728\u6574\u5408\u6700\u8fd1\u4f1a\u8bca\u3001\u8fd1\u671f\u5feb\u7167\u548c\u8fde\u7eed\u4fe1\u53f7",
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "recent_context",
        title: "\u6700\u8fd1\u4f1a\u8bca",
        text:
          buildRecentItems(result).join("\u3001") ||
          String(asRecord(result.coordinatorSummary).finalConclusion ?? ""),
        items: buildRecentItems(result),
        append: false,
        source: providerTrace.source ?? "unknown",
      },
    },
    {
      event: "status",
      data: {
        stage: "current_recommendation",
        title: "\u5f53\u524d\u5efa\u8bae",
        message:
          "\u6b63\u5728\u751f\u6210\u4eca\u5929\u56ed\u5185\u3001\u4eca\u665a\u5bb6\u5ead\u548c 48 \u5c0f\u65f6\u590d\u67e5\u5efa\u8bae",
        traceId,
        providerTrace,
        memory: memoryMeta,
      },
    },
    {
      event: "text",
      data: {
        stage: "current_recommendation",
        title: "\u5f53\u524d\u5efa\u8bae",
        text: String(result.summary ?? asRecord(result.coordinatorSummary).finalConclusion ?? ""),
        items: [
          ...asStringArray(result.todayInSchoolActions).slice(0, 2),
          ...asStringArray(result.tonightAtHomeActions).slice(0, 2),
          ...asStringArray(result.followUp48h).slice(0, 2),
        ].filter(Boolean),
        append: false,
        source: providerTrace.source ?? "unknown",
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
        realProvider: Boolean(providerTrace.realProvider),
        fallback: Boolean(providerTrace.fallback),
      },
    },
  ];
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/consultations/high-risk/stream");
  if (brainForward.response) return brainForward.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: mergeHeaders(
        { "Content-Type": "application/json" },
        buildLocalStreamHeaders(brainForward)
      ),
    });
  }

  const events = await buildFallbackEvents(payload, new URL(request.url).origin, brainForward, request.headers);
  return streamResponse(events, 200, buildLocalStreamHeaders(brainForward));
}
