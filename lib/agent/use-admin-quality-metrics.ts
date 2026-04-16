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
        const response = await fetch("/api/ai/admin-quality-metrics", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            institutionId,
            windowDays,
            includeDemoFallback,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | unknown;

        if (cancelled) return;

        if (!response.ok) {
          setState({
            data: null,
            status: "unavailable",
            error:
              (typeof payload === "object" &&
                payload !== null &&
                "error" in payload &&
                typeof payload.error === "string" &&
                payload.error) ||
              "admin quality metrics are unavailable",
          });
          return;
        }

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
