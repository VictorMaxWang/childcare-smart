"use client";

import { useCallback, useMemo, useState } from "react";
import type { ConsultationResult } from "../ai/types";
import {
  buildAdminConsultationPriorityItems,
  type AdminConsultationChildMeta,
  type AdminConsultationPriorityItem,
} from "./admin-consultation";
import type { AdminDispatchCreatePayload, AdminDispatchEvent } from "./admin-types";
import {
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
  useAdminWorkspaceLoader,
  type UseAdminWorkspaceLoaderOptions,
} from "./use-admin-workspace-loader";
import type {
  AdminConsultationFeedState,
  AdminConsultationFeedStatus,
  UseAdminConsultationFeedOptions,
} from "./use-admin-consultation-feed";

export interface AdminConsultationFeedBadge {
  label: string;
  variant: "success" | "warning" | "outline";
}

export interface AdminConsultationWorkspaceView {
  priorityItems: AdminConsultationPriorityItem[];
  feedStatus: AdminConsultationFeedStatus;
  feedBadge: AdminConsultationFeedBadge;
}

export interface UseAdminConsultationWorkspaceOptions {
  institutionName: string;
  visibleChildren: AdminConsultationChildMeta[];
  localConsultations?: ConsultationResult[];
  consultationFeedOptions?: Omit<UseAdminConsultationFeedOptions, "enabled">;
}

function createDefaultFeedBadge(): AdminConsultationFeedBadge {
  return {
    label: "loading feed",
    variant: "outline",
  };
}

export function getAdminConsultationFeedBadge(params: {
  feedStatus: AdminConsultationFeedStatus;
  localConsultationCount: number;
  fallbackUsed?: boolean;
}): AdminConsultationFeedBadge {
  if (params.feedStatus === "ready" && !params.fallbackUsed) {
    return {
      label: "backend feed",
      variant: "success",
    };
  }

  if (params.feedStatus === "ready" && params.fallbackUsed) {
    return {
      label: "demo-backed feed",
      variant: "outline",
    };
  }

  if (params.feedStatus === "unavailable" && params.localConsultationCount > 0) {
    return {
      label: "local fallback",
      variant: "outline",
    };
  }

  if (params.feedStatus === "unavailable") {
    return {
      label: "feed unavailable",
      variant: "warning",
    };
  }

  return createDefaultFeedBadge();
}

export function buildAdminConsultationWorkspaceView(params: {
  institutionName: string;
  children: AdminConsultationChildMeta[];
  consultationFeed: AdminConsultationFeedState;
  localConsultations?: ConsultationResult[];
  notificationEvents?: AdminDispatchEvent[];
  limit?: number;
}): AdminConsultationWorkspaceView {
  const localConsultations = params.localConsultations ?? [];
  const hasBackendItems = params.consultationFeed.items.length > 0;
  const fallbackUsed =
    params.consultationFeed.status === "unavailable" ||
    (params.consultationFeed.status === "ready" && !hasBackendItems);

  return {
    priorityItems: buildAdminConsultationPriorityItems({
      institutionName: params.institutionName,
      feedItems: hasBackendItems ? params.consultationFeed.items : undefined,
      localConsultations,
      children: params.children,
      notificationEvents: params.notificationEvents,
      limit: params.limit ?? 4,
      useLocalFallback: fallbackUsed,
    }),
    feedStatus: params.consultationFeed.status,
    feedBadge: getAdminConsultationFeedBadge({
      feedStatus: params.consultationFeed.status,
      localConsultationCount: localConsultations.length,
      fallbackUsed,
    }),
  };
}

function sanitizeAdminDispatchStatusMessage(message?: string | null) {
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

export function getAdminDispatchUnavailableMessage(params: {
  dispatchAvailable: boolean;
  dispatchStatusMessage: string | null;
  dispatchReasonCode: string | null;
}) {
  if (params.dispatchAvailable) {
    return null;
  }

  if (params.dispatchReasonCode === "notification_store_unavailable") {
    return ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE;
  }

  return sanitizeAdminDispatchStatusMessage(params.dispatchStatusMessage);
}

export function useAdminConsultationWorkspace(
  options: UseAdminConsultationWorkspaceOptions
) {
  const { institutionName, visibleChildren, localConsultations = [], consultationFeedOptions } = options;
  const {
    consultationFeed,
    notificationEvents,
    notificationError: loaderNotificationError,
    notificationReady,
    dispatchAvailable,
    dispatchStatusMessage,
    dispatchReasonCode,
    upsertNotificationEvent,
  } = useAdminWorkspaceLoader({
    visibleChildrenCount: visibleChildren.length,
    consultationFeedOptions,
  } satisfies UseAdminWorkspaceLoaderOptions);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [creatingNotificationKey, setCreatingNotificationKey] = useState<string | null>(null);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);

  const view = useMemo(
    () =>
      buildAdminConsultationWorkspaceView({
        institutionName,
        children: visibleChildren,
        consultationFeed,
        localConsultations,
        notificationEvents,
        limit: consultationFeedOptions?.limit ?? 4,
      }),
    [
      consultationFeed,
      consultationFeedOptions?.limit,
      institutionName,
      localConsultations,
      notificationEvents,
      visibleChildren,
    ]
  );

  const createNotification = useCallback(
    async (
      payload: AdminDispatchCreatePayload,
      requestKey = payload.priorityItemId || payload.targetId
    ) => {
      const unavailableMessage = getAdminDispatchUnavailableMessage({
        dispatchAvailable,
        dispatchStatusMessage,
        dispatchReasonCode,
      });

      if (unavailableMessage) {
        setMutationError(unavailableMessage);
        return null;
      }

      setCreatingNotificationKey(requestKey);
      setMutationError(null);

      try {
        const response = await fetch("/api/admin/notification-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { item?: AdminDispatchEvent; error?: string; message?: string };

        if (!response.ok || !data.item) {
          setMutationError(
            sanitizeAdminDispatchStatusMessage(data.message ?? data.error)
          );
          return null;
        }

        upsertNotificationEvent(data.item);
        return data.item;
      } catch (error) {
        console.error("[ADMIN_WORKSPACE] Failed to create notification event", error);
        setMutationError(ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE);
        return null;
      } finally {
        setCreatingNotificationKey(null);
      }
    },
    [dispatchAvailable, dispatchReasonCode, dispatchStatusMessage, upsertNotificationEvent]
  );

  const createConsultationScopedNotification = useCallback(
    async (item: AdminConsultationPriorityItem) => {
      if (!item.notificationPayload) {
        setMutationError("当前会诊缺少可创建的派单 payload");
        return null;
      }

      return createNotification(item.notificationPayload, item.consultationId);
    },
    [createNotification]
  );

  const updateNotificationStatus = useCallback(
    async (eventId: string, status: AdminDispatchEvent["status"]) => {
      const unavailableMessage = getAdminDispatchUnavailableMessage({
        dispatchAvailable,
        dispatchStatusMessage,
        dispatchReasonCode,
      });

      if (unavailableMessage) {
        setMutationError(unavailableMessage);
        return null;
      }

      setUpdatingEventId(eventId);
      setMutationError(null);

      try {
        const response = await fetch("/api/admin/notification-events", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: eventId,
            status,
          }),
        });
        const data = (await response.json()) as { item?: AdminDispatchEvent; error?: string; message?: string };

        if (!response.ok || !data.item) {
          setMutationError(
            sanitizeAdminDispatchStatusMessage(data.message ?? data.error)
          );
          return null;
        }

        upsertNotificationEvent(data.item);
        return data.item;
      } catch (error) {
        console.error("[ADMIN_WORKSPACE] Failed to update notification event", error);
        setMutationError(ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE);
        return null;
      } finally {
        setUpdatingEventId(null);
      }
    },
    [dispatchAvailable, dispatchReasonCode, dispatchStatusMessage, upsertNotificationEvent]
  );

  const isCreatingNotification = useCallback(
    (requestKey: string) => creatingNotificationKey === requestKey,
    [creatingNotificationKey]
  );

  return {
    priorityItems: view.priorityItems,
    feedStatus: view.feedStatus,
    feedBadge: view.feedBadge,
    notificationEvents,
    notificationError: mutationError ?? loaderNotificationError,
    notificationReady,
    dispatchAvailable,
    dispatchStatusMessage,
    dispatchReasonCode,
    createNotification,
    createConsultationScopedNotification,
    updateNotificationStatus,
    isCreatingNotification,
    updatingEventId,
  };
}
