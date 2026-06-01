"use client";

import { useEffect, useState } from "react";

export type AdminConsultationFeedStatus = "loading" | "ready" | "unavailable";
export type AdminConsultationFeedSource = "remote-brain" | "local-demo" | "cache" | "unknown";

export interface AdminConsultationFeedState {
  items: unknown[];
  status: AdminConsultationFeedStatus;
  error: string | null;
  source: AdminConsultationFeedSource;
  fallback: boolean;
  fallbackReason: string | null;
  message: string | null;
  lastUpdatedAt: string | null;
}

export interface UseAdminConsultationFeedOptions {
  enabled?: boolean;
  limit?: number;
  escalatedOnly?: boolean;
}

const INITIAL_STATE: AdminConsultationFeedState = {
  items: [],
  status: "loading",
  error: null,
  source: "unknown",
  fallback: false,
  fallbackReason: null,
  message: null,
  lastUpdatedAt: null,
};

type FeedPayload = {
  items?: unknown[];
  error?: string;
  message?: string;
  source?: AdminConsultationFeedSource;
  fallback?: boolean;
  fallbackReason?: string | null;
};

function buildUnavailableFeedState(
  previous: AdminConsultationFeedState,
  error: string,
  fallbackReason: string | null
): AdminConsultationFeedState {
  if (previous.items.length > 0) {
    return {
      ...previous,
      status: "ready",
      error: null,
      source: "cache",
      fallback: true,
      fallbackReason,
      message: "远端 feed 暂不可用，当前使用最近缓存数据。",
    };
  }

  return {
    items: [],
    status: "unavailable",
    error,
    source: "local-demo",
    fallback: true,
    fallbackReason,
    message: "当前使用本地演示数据；远端 feed 暂不可用。",
    lastUpdatedAt: null,
  };
}

export function useAdminConsultationFeed(
  options: UseAdminConsultationFeedOptions = {}
) {
  const { enabled = true, limit = 4, escalatedOnly = true } = options;
  const [state, setState] = useState<AdminConsultationFeedState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let cancelled = false;

    async function loadFeed() {
      setState((previous) => ({
        ...previous,
        status: "loading",
        error: null,
      }));

      const search = new URLSearchParams();
      search.set("limit", String(limit));
      if (escalatedOnly) {
        search.set("escalated_only", "true");
      }

      try {
        const response = await fetch(
          `/api/ai/high-risk-consultation/feed?${search.toString()}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const payload = (await response.json().catch(() => null)) as FeedPayload | null;

        if (cancelled) return;

        if (!response.ok) {
          setState((previous) =>
            buildUnavailableFeedState(
              previous,
              payload?.error ?? "high-risk consultation feed is unavailable",
              payload?.fallbackReason ?? `http-${response.status}`
            )
          );
          return;
        }

        if (!payload || !Array.isArray(payload.items)) {
          setState((previous) =>
            buildUnavailableFeedState(
              previous,
              "malformed high-risk consultation feed payload",
              "malformed-feed-payload"
            )
          );
          return;
        }

        setState({
          items: payload.items,
          status: "ready",
          error: null,
          source: payload.source ?? (payload.fallback ? "local-demo" : "remote-brain"),
          fallback: Boolean(payload.fallback),
          fallbackReason: payload.fallbackReason ?? null,
          message:
            payload.message ??
            (payload.fallback ? "当前使用本地演示数据；远端 feed 暂不可用。" : null),
          lastUpdatedAt: new Date().toISOString(),
        });
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setState((previous) =>
          buildUnavailableFeedState(
            previous,
            "high-risk consultation feed is unavailable",
            "fetch-failed"
          )
        );
      }
    }

    void loadFeed();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, escalatedOnly, limit]);

  return enabled ? state : INITIAL_STATE;
}
