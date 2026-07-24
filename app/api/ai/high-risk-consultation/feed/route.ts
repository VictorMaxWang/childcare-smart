import { NextResponse } from "next/server";
import { createBrainTransportHeaders, forwardBrainRequest } from "@/lib/server/brain-client";
import {
  aiRouteLimitedResponse,
  authorizeAiRouteSession,
} from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
  type SessionScope,
} from "@/lib/server/session-scope";
import { buildAdminLocalConsultationFeedItems } from "@/lib/agent/admin-local-consultation-fallback";

type FeedPayload = {
  items?: unknown[];
  count?: number;
  source?: string;
  fallback?: boolean;
  fallbackReason?: string | null;
  [key: string]: unknown;
};

function buildLocalFallbackHeaders(targetPath: string, fallbackReason: string | null, upstreamHost: string | null) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath,
    upstreamHost,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
  });
}

function buildRemoteHeaders(headers: Headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-type");
  return responseHeaders;
}

function readPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readEscalatedOnly(value: string | null) {
  return value === "true" || value === "1";
}

function buildDemoLocalFallbackBody(url: URL, fallbackReason: string | null) {
  const limit = readPositiveInteger(url.searchParams.get("limit"), 4);
  const items = buildAdminLocalConsultationFeedItems({
    limit,
    escalatedOnly: readEscalatedOnly(url.searchParams.get("escalated_only")),
  });

  return {
    items,
    count: items.length,
    source: "local-demo",
    fallback: true,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
    message: "远端 feed 暂不可用，当前使用本地演示数据。",
  };
}

function buildScopedConsultationFeedItems(scope: SessionScope, url: URL) {
  const limit = readPositiveInteger(url.searchParams.get("limit"), 4);
  const childIdFilter = url.searchParams.get("child_id")?.trim() || null;
  const riskLevelFilter = url.searchParams.get("risk_level")?.trim() || null;
  const statusFilter = url.searchParams.get("status")?.trim() || null;
  const ownerNameFilter = url.searchParams.get("owner_name")?.trim().toLowerCase() || null;
  const escalatedOnly = readEscalatedOnly(url.searchParams.get("escalated_only"));
  const childById = new Map(scope.visibleChildren.map((child) => [child.id, child]));

  return scope.scopedSnapshot.consultations
    .filter((consultation) => {
      if (!childById.has(consultation.childId)) return false;
      if (childIdFilter && consultation.childId !== childIdFilter) return false;
      if (riskLevelFilter && consultation.riskLevel !== riskLevelFilter) return false;
      const decisionCard = consultation.directorDecisionCard ?? {};
      if (statusFilter && decisionCard.status !== statusFilter) return false;
      const ownerName = decisionCard.recommendedOwnerName?.toLowerCase() ?? "";
      if (ownerNameFilter && !ownerName.includes(ownerNameFilter)) return false;
      if (escalatedOnly && !consultation.shouldEscalateToAdmin) return false;
      return true;
    })
    .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))
    .slice(0, limit)
    .map((consultation) => {
      const child = childById.get(consultation.childId);
      const decisionCard = consultation.directorDecisionCard ?? {};
      return {
        consultationId: consultation.consultationId,
        childId: consultation.childId,
        childName: child?.name ?? consultation.childId,
        className: child?.className ?? "",
        generatedAt: consultation.generatedAt,
        riskLevel: consultation.riskLevel,
        triggerReason: consultation.triggerReason,
        triggerReasons: consultation.triggerReasons,
        summary: consultation.summary,
        directorDecisionCard: decisionCard,
        status: decisionCard.status ?? "pending",
        ownerName: decisionCard.recommendedOwnerName ?? "",
        ownerRole: decisionCard.recommendedOwnerRole ?? "admin",
        dueAt: decisionCard.recommendedAt ?? consultation.generatedAt,
        whyHighPriority:
          decisionCard.reason ??
          consultation.coordinatorSummary?.finalConclusion ??
          consultation.triggerReason,
        todayInSchoolActions: consultation.todayInSchoolActions,
        tonightAtHomeActions: consultation.tonightAtHomeActions,
        followUp48h: consultation.followUp48h,
        syncTargets: [],
        shouldEscalateToAdmin: consultation.shouldEscalateToAdmin,
        evidenceItems: consultation.evidenceItems ?? [],
        explainabilitySummary: {
          agentParticipants: consultation.participants.map((participant) => participant.label),
          keyFindings: consultation.keyFindings,
          coordinationConclusion:
            consultation.coordinatorSummary?.finalConclusion ?? consultation.summary,
          evidenceHighlights:
            consultation.evidenceItems?.map((item) => `${item.sourceLabel}: ${item.summary}`).slice(0, 4) ?? [],
        },
        providerTraceSummary: consultation.providerTrace,
        memoryMetaSummary: consultation.memoryMeta,
      };
    });
}

function buildScopedLocalFallbackBody(scope: SessionScope, url: URL, fallbackReason: string | null) {
  const items = buildScopedConsultationFeedItems(scope, url);
  return {
    items,
    count: items.length,
    source: "session-scope",
    fallback: true,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
    message: "Remote feed is unavailable; showing consultations visible to the current session only.",
  };
}

function localFallbackResponse(params: {
  url: URL;
  targetPath: string;
  fallbackReason: string | null;
  upstreamHost: string | null;
  sessionScope: SessionScope;
}) {
  const body =
    params.sessionScope.user.accountKind === "demo"
      ? buildDemoLocalFallbackBody(params.url, params.fallbackReason)
      : buildScopedLocalFallbackBody(params.sessionScope, params.url, params.fallbackReason);
  return NextResponse.json(body, {
    status: 200,
    headers: buildLocalFallbackHeaders(params.targetPath, params.fallbackReason, params.upstreamHost),
  });
}

export async function GET(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    requiredRole: "staff",
    allowUnscoped: true,
  });
  if (authResult instanceof Response) return authResult;

  const url = new URL(request.url);
  // Feed 没有客户端资源 scope；数据范围必须由服务端 session 投影决定，
  // 随后仍会对可见幼儿和可选 child_id 做二次校验。
  const sessionScope = await getSessionScope(authResult.session);
  if (authResult.session.user.accountKind !== "demo" && sessionScope.visibleChildren.length === 0) {
    return aiRouteLimitedResponse({
      reason: "scope_required",
      error: "Current staff account does not have a visible child scope for consultation feed.",
      requiredRole: "staff",
    });
  }
  const queriedChildId = url.searchParams.get("child_id")?.trim();
  if (queriedChildId) {
    try {
      requireScopedChild(sessionScope, queriedChildId);
    } catch (error) {
      if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
        return aiRouteLimitedResponse({
          reason: "forbidden_child",
          error: "Current account cannot access this child consultation feed.",
          requiredRole: "staff",
        });
      }
      throw error;
    }
  }
  const targetPath = `/api/v1/agents/consultations/high-risk/feed${url.search}`;
  const brainForward = await forwardBrainRequest(request, targetPath, {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });
  if (brainForward.response) {
    if (!brainForward.response.ok) {
      return localFallbackResponse({
        url,
        targetPath,
        fallbackReason: `brain-status-${brainForward.response.status}`,
        upstreamHost: brainForward.upstreamHost,
        sessionScope,
      });
    }

    try {
      const payload = (await brainForward.response.clone().json()) as FeedPayload | null;
      if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
        return NextResponse.json(
          {
            ...payload,
            items: payload.items,
            count: typeof payload.count === "number" ? payload.count : payload.items.length,
            source: "remote-brain",
            fallback: false,
            fallbackReason: null,
          },
          {
            status: brainForward.response.status,
            headers: buildRemoteHeaders(brainForward.response.headers),
          }
        );
      }
    } catch {
      return localFallbackResponse({
        url,
        targetPath,
        fallbackReason: "brain-feed-invalid-json",
        upstreamHost: brainForward.upstreamHost,
        sessionScope,
      });
    }

    return localFallbackResponse({
      url,
      targetPath,
      fallbackReason: "brain-feed-empty-real-empty-state",
      upstreamHost: brainForward.upstreamHost,
      sessionScope,
    });
  }

  return localFallbackResponse({
    url,
    targetPath,
    fallbackReason: brainForward.fallbackReason,
    upstreamHost: brainForward.upstreamHost,
    sessionScope,
  });
}
