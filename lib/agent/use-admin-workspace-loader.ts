"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminDispatchEvent } from "./admin-types";
import {
  useAdminConsultationFeed,
  type UseAdminConsultationFeedOptions,
} from "./use-admin-consultation-feed";

const INITIAL_NOTIFICATION_EVENTS: AdminDispatchEvent[] = [];

export const ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE = "通知派单暂不可用";
export const ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE =
  "notification_store_unavailable";

export interface AdminNotificationEventsAvailabilityState {
  dispatchAvailable: boolean;
  dispatchStatusMessage: string | null;
  dispatchReasonCode: string | null;
}

const STATUS_RANK: Record<AdminDispatchEvent["status"], number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

export interface UseAdminWorkspaceLoaderOptions {
  visibleChildrenCount: number;
  consultationFeedOptions?: Omit<UseAdminConsultationFeedOptions, "enabled">;
}

export function shouldEnableAdminConsultationFeed(params: {
  visibleChildrenCount: number;
  notificationReady?: boolean;
}) {
  return params.visibleChildrenCount > 0;
}

export function sortAdminNotificationEvents(events: AdminDispatchEvent[]) {
  return [...events].sort((left, right) => {
    const statusDiff = STATUS_RANK[left.status] - STATUS_RANK[right.status];
    if (statusDiff !== 0) return statusDiff;
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function upsertAdminNotificationEvent(
  events: AdminDispatchEvent[],
  nextEvent: AdminDispatchEvent
) {
  return sortAdminNotificationEvents([
    nextEvent,
    ...events.filter((event) => event.id !== nextEvent.id),
  ]);
}

function mergeAdminNotificationEvents(
  currentEvents: AdminDispatchEvent[],
  incomingEvents: AdminDispatchEvent[]
) {
  return incomingEvents.reduce(
    (result, event) => upsertAdminNotificationEvent(result, event),
    currentEvents
  );
}

function sanitizeAdminNotificationEventsStatusMessage(
  message?: string | null
) {
  if (!message) {
    return ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE;
  }

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE;
  }

  if (/DATABASE_URL/i.test(trimmedMessage)) {
    return ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE;
  }

  return trimmedMessage;
}

export function normalizeAdminNotificationEventsAvailabilityState(params: {
  responseOk: boolean;
  payload?: {
    available?: boolean;
    reasonCode?: string | null;
    message?: string | null;
    error?: string | null;
  } | null;
}): AdminNotificationEventsAvailabilityState {
  if (params.responseOk && params.payload?.available !== false) {
    return {
      dispatchAvailable: true,
      dispatchStatusMessage: null,
      dispatchReasonCode: null,
    };
  }

  return {
    dispatchAvailable: false,
    dispatchStatusMessage: sanitizeAdminNotificationEventsStatusMessage(
      params.payload?.message ?? params.payload?.error
    ),
    dispatchReasonCode:
      params.payload?.reasonCode ?? ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE,
  };
}

export function useAdminWorkspaceLoader(
  options: UseAdminWorkspaceLoaderOptions
) {
  const { visibleChildrenCount, consultationFeedOptions } = options;
  const consultationFeed = useAdminConsultationFeed({
    ...consultationFeedOptions,
    enabled: shouldEnableAdminConsultationFeed({
      visibleChildrenCount,
      notificationReady: false,
    }),
  });
  const [notificationEvents, setNotificationEvents] =
    useState<AdminDispatchEvent[]>(INITIAL_NOTIFICATION_EVENTS);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [dispatchAvailable, setDispatchAvailable] = useState(true);
  const [dispatchStatusMessage, setDispatchStatusMessage] = useState<string | null>(null);
  const [dispatchReasonCode, setDispatchReasonCode] = useState<string | null>(null);
  const [notificationReady, setNotificationReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationEvents() {
      try {
        const response = await fetch("/api/admin/notification-events", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          items?: AdminDispatchEvent[];
          available?: boolean;
          reasonCode?: string;
          message?: string;
          error?: string;
        };

        if (cancelled) return;

        const availability = normalizeAdminNotificationEventsAvailabilityState({
          responseOk: response.ok,
          payload,
        });

        setDispatchAvailable(availability.dispatchAvailable);
        setDispatchStatusMessage(availability.dispatchStatusMessage);
        setDispatchReasonCode(availability.dispatchReasonCode);

        if (!availability.dispatchAvailable) {
          setNotificationError(availability.dispatchStatusMessage);
          setNotificationReady(true);
          return;
        }

        setNotificationEvents((previous) =>
          mergeAdminNotificationEvents(previous, payload.items ?? [])
        );
        setNotificationError(null);
        setNotificationReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error("[ADMIN_WORKSPACE] Failed to load notification events", error);
        setDispatchAvailable(false);
        setDispatchStatusMessage(ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE);
        setDispatchReasonCode(ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE);
        setNotificationError(ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE);
        setNotificationReady(true);
      }
    }

    void loadNotificationEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const upsertNotificationEvent = useCallback((nextEvent: AdminDispatchEvent) => {
    setNotificationEvents((previous) =>
      upsertAdminNotificationEvent(previous, nextEvent)
    );
    setNotificationError(null);
    setDispatchAvailable(true);
    setDispatchStatusMessage(null);
    setDispatchReasonCode(null);
    setNotificationReady(true);
  }, []);

  return {
    consultationFeed,
    notificationEvents,
    notificationError,
    notificationReady,
    dispatchAvailable,
    dispatchStatusMessage,
    dispatchReasonCode,
    upsertNotificationEvent,
  };
}
