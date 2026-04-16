import type {
  AdminAgentActionItem,
  AdminAgentResult,
  AdminDispatchEvent,
  AdminFeedbackRiskSummary,
  AdminHomeViewModel,
  AdminRiskChildSummary,
  InstitutionPriorityItem,
} from "@/lib/agent/admin-types";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";

const DEFAULT_ACTION_ENTRY_SUMMARY = "建议园长先从已置顶会诊区和当前最高优先级事项推进今日闭环。";

type FeaturedChildTracker = {
  ids: Set<string>;
  names: Set<string>;
};

function isChildScopedTarget(targetType: InstitutionPriorityItem["targetType"] | AdminAgentActionItem["targetType"]) {
  return targetType === "child" || targetType === "family";
}

function createFeaturedChildTracker(
  consultationPriorityItems: AdminConsultationPriorityItem[]
): FeaturedChildTracker {
  return {
    ids: new Set(consultationPriorityItems.map((item) => item.childId)),
    names: new Set(consultationPriorityItems.map((item) => item.decision.childName)),
  };
}

function containsFeaturedChildName(text: string, childNames: Set<string>) {
  for (const childName of childNames) {
    if (childName && text.includes(childName)) {
      return true;
    }
  }

  return false;
}

function markFeaturedChild(tracker: FeaturedChildTracker, childId: string, childName: string) {
  if (!childId || !childName) return;
  tracker.ids.add(childId);
  tracker.names.add(childName);
  tracker.names.add(`${childName}家长`);
}

function dedupePriorityTopItems(
  items: InstitutionPriorityItem[],
  tracker: FeaturedChildTracker,
  limit: number
) {
  const next: InstitutionPriorityItem[] = [];

  for (const item of items) {
    if (isChildScopedTarget(item.targetType)) {
      if (tracker.ids.has(item.targetId)) {
        continue;
      }

      markFeaturedChild(tracker, item.targetId, item.targetName);
    }

    next.push(item);
    if (next.length >= limit) break;
  }

  return next;
}

function dedupeRiskChildren(
  items: AdminRiskChildSummary[],
  tracker: FeaturedChildTracker,
  limit: number
) {
  const next: AdminRiskChildSummary[] = [];

  for (const item of items) {
    if (tracker.ids.has(item.childId)) {
      continue;
    }

    markFeaturedChild(tracker, item.childId, item.childName);
    next.push(item);
    if (next.length >= limit) break;
  }

  return next;
}

function dedupeFeedbackRiskItems(
  items: AdminFeedbackRiskSummary[],
  tracker: FeaturedChildTracker,
  limit: number
) {
  const next: AdminFeedbackRiskSummary[] = [];

  for (const item of items) {
    if (tracker.ids.has(item.childId)) {
      continue;
    }

    markFeaturedChild(tracker, item.childId, item.childName);
    next.push(item);
    if (next.length >= limit) break;
  }

  return next;
}

function markActionItemChildren(
  items: AdminAgentActionItem[],
  tracker: FeaturedChildTracker
) {
  for (const item of items) {
    if (!isChildScopedTarget(item.targetType)) {
      continue;
    }

    markFeaturedChild(tracker, item.targetId, item.targetName);
  }
}

function dedupeTextItems(items: string[], tracker: FeaturedChildTracker, limit: number) {
  return items
    .filter((item) => !containsFeaturedChildName(item, tracker.names))
    .slice(0, limit);
}

function dedupeActionEntrySummary(summary: string, tracker: FeaturedChildTracker) {
  if (!summary) return summary;
  return containsFeaturedChildName(summary, tracker.names)
    ? DEFAULT_ACTION_ENTRY_SUMMARY
    : summary;
}

function isConsultationScopedEvent(
  event: AdminDispatchEvent,
  consultationIds: Set<string>,
  childIds: Set<string>
) {
  if (event.priorityItemId && consultationIds.has(event.priorityItemId)) {
    return true;
  }

  if (event.targetType === "child" && childIds.has(event.targetId)) {
    return Boolean(
      event.source?.consultationId || (event.source?.relatedConsultationIds?.length ?? 0) > 0
    );
  }

  if (event.source?.consultationId && consultationIds.has(event.source.consultationId)) {
    return true;
  }

  return Boolean(event.source?.relatedConsultationIds?.some((id) => consultationIds.has(id)));
}

function compactConsultationDispatchSummary(event: AdminDispatchEvent) {
  const nextSummary =
    event.status === "completed"
      ? "重点会诊事项已完成闭环。"
      : event.status === "in_progress"
        ? "重点会诊事项正在跟进中。"
        : "重点会诊事项待派发跟进。";

  return {
    ...event,
    summary: nextSummary,
  } satisfies AdminDispatchEvent;
}

export function dedupeAdminHomeExposure(
  home: AdminHomeViewModel,
  consultationPriorityItems: AdminConsultationPriorityItem[]
) {
  const tracker = createFeaturedChildTracker(consultationPriorityItems);
  const featuredConsultationIds = new Set(
    consultationPriorityItems.map((item) => item.consultationId)
  );

  const priorityTopItems = dedupePriorityTopItems(
    home.priorityTopItems,
    tracker,
    3
  );
  const riskChildren = dedupeRiskChildren(home.riskChildren, tracker, 4);
  const weeklyHighlights = dedupeTextItems(home.weeklyHighlights, tracker, 4);
  const pendingItems = dedupeTextItems(home.pendingItems, tracker, 4);
  const actionEntrySummary = dedupeActionEntrySummary(home.actionEntrySummary, tracker);
  const pendingDispatches = home.pendingDispatches
    .map((event) =>
      isConsultationScopedEvent(event, featuredConsultationIds, tracker.ids)
        ? compactConsultationDispatchSummary(event)
        : event
    )
    .slice(0, 4);

  return {
    ...home,
    priorityTopItems,
    riskChildren,
    weeklyHighlights,
    pendingItems,
    actionEntrySummary,
    pendingDispatches,
  } satisfies AdminHomeViewModel;
}

export function dedupeAdminAgentResultExposure(
  result: AdminAgentResult,
  consultationPriorityItems: AdminConsultationPriorityItem[]
) {
  const tracker = createFeaturedChildTracker(consultationPriorityItems);

  const priorityTopItems = dedupePriorityTopItems(
    result.priorityTopItems,
    tracker,
    result.priorityTopItems.length
  );
  const riskChildren = dedupeRiskChildren(
    result.riskChildren,
    tracker,
    result.riskChildren.length
  );
  const feedbackRiskItems = dedupeFeedbackRiskItems(
    result.feedbackRiskItems,
    tracker,
    result.feedbackRiskItems.length
  );
  markActionItemChildren(result.actionItems, tracker);
  const highlights = dedupeTextItems(result.highlights, tracker, result.highlights.length);

  return {
    ...result,
    priorityTopItems,
    riskChildren,
    feedbackRiskItems,
    highlights,
  } satisfies AdminAgentResult;
}
