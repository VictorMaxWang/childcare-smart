"use client";

import { useEffect, useState } from "react";

export type AdminConsultationFeedStatus = "loading" | "ready" | "unavailable";

export interface AdminConsultationFeedState {
  items: unknown[];
  status: AdminConsultationFeedStatus;
  error: string | null;
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
};

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

        const payload = (await response.json().catch(() => null)) as
          | { items?: unknown[]; error?: string }
          | null;

        if (cancelled) return;

        if (!response.ok) {
          setState({
            items: [],
            status: "unavailable",
            error:
              payload?.error ??
              "high-risk consultation feed is unavailable",
          });
          return;
        }

        if (!payload || !Array.isArray(payload.items)) {
          setState({
            items: [],
            status: "unavailable",
            error: "malformed high-risk consultation feed payload",
          });
          return;
        }

        setState({
          items: payload.items,
          status: "ready",
          error: null,
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[ADMIN_FEED] Failed to load consultation feed", error);
        setState({
          items: [],
          status: "unavailable",
          error: "high-risk consultation feed is unavailable",
        });
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
