import { useEffect, useState } from "react";
import {
  normalizeAdminQualityMetricsResponse,
  type AdminQualityMetricsResponse,
} from "@/lib/agent/admin-quality-metrics";

export type AdminQualityMetricsStatus = "loading" | "ready" | "unavailable";

export interface AdminQualityMetricsState {
  data: AdminQualityMetricsResponse | null;
  status: AdminQualityMetricsStatus;
  error: string | null;
}

export interface UseAdminQualityMetricsOptions {
  institutionId?: string;
  enabled?: boolean;
  windowDays?: number;
  includeDemoFallback?: boolean;
}

const INITIAL_STATE: AdminQualityMetricsState = {
  data: null,
  status: "loading",
  error: null,
};

function unwrapApiPayload(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "ok" in payload &&
    (payload as { ok?: unknown }).ok === true &&
    "data" in payload
  ) {
    return (payload as { data: unknown }).data;
  }

  return payload;
}

async function fetchMetricsPayload(
  input: {
    institutionId?: string;
    windowDays: number;
    includeDemoFallback: boolean;
    signal: AbortSignal;
  }
) {
  const query = new URLSearchParams({
    windowDays: String(input.windowDays),
    includeDemoFallback: input.includeDemoFallback ? "1" : "0",
  });
  if (input.institutionId) query.set("institutionId", input.institutionId);

  const analyticsResponse = await fetch(`/api/analytics/admin/quality-metrics?${query.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
  });
  const analyticsPayload = unwrapApiPayload(await analyticsResponse.json().catch(() => null));
  if (analyticsResponse.ok) {
    return analyticsPayload;
  }

  const aiResponse = await fetch("/api/ai/admin-quality-metrics", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      institutionId: input.institutionId,
      windowDays: input.windowDays,
      includeDemoFallback: input.includeDemoFallback,
    }),
  });
  const aiPayload = unwrapApiPayload(await aiResponse.json().catch(() => null));
  if (!aiResponse.ok) {
    const error =
      aiPayload &&
      typeof aiPayload === "object" &&
      "error" in aiPayload &&
      typeof (aiPayload as { error?: unknown }).error === "string"
        ? (aiPayload as { error: string }).error
        : "admin quality metrics are unavailable";
    throw new Error(error);
  }

  return aiPayload;
}

export function useAdminQualityMetrics(
  options: UseAdminQualityMetricsOptions = {}
) {
  const {
    institutionId,
    enabled = true,
    windowDays = 7,
    includeDemoFallback = true,
  } = options;
  const [state, setState] = useState<AdminQualityMetricsState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadMetrics() {
      setState({
        data: null,
        status: "loading",
        error: null,
      });

      try {
        const payload = await fetchMetricsPayload({
          institutionId,
          windowDays,
          includeDemoFallback,
          signal: controller.signal,
        });

        if (cancelled) return;

        const normalized = normalizeAdminQualityMetricsResponse(payload);
        if (!normalized) {
          setState({
            data: null,
            status: "unavailable",
            error: "malformed admin quality metrics payload",
          });
          return;
        }

        setState({
          data: normalized,
          status: "ready",
          error: null,
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[ADMIN_QUALITY] Failed to load admin quality metrics", error);
        setState({
          data: null,
          status: "unavailable",
          error: "admin quality metrics are unavailable",
        });
      }
    }

    void loadMetrics();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, includeDemoFallback, institutionId, windowDays]);

  return enabled ? state : INITIAL_STATE;
}
