import { NextResponse } from "next/server";
import {
  buildAiProviderUnavailableBody,
  executeFollowUp,
  getAiRuntimeOptions,
  isAiProviderUnavailableError,
  isValidFollowUpPayload,
} from "@/lib/ai/server";
import type { AiFollowUpPayload, AiFollowUpResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { selectStructuredFeedbackConsumption } from "@/lib/feedback/consumption";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildChildSuggestionSnapshotFromScope,
  buildParentFollowUpPayloadFromScope,
} from "@/lib/server/ai-scoped-payloads";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";
import { logSecurityEvent } from "@/lib/server/security-log";
import {
  buildCurrentInterventionCardFromTask,
  buildTasksFromFollowUpCardContext,
  pickActiveTask,
} from "@/lib/tasks/task-model";
import type { CanonicalTask, FollowUpTask } from "@/lib/tasks/types";

function mergeTasks(...taskGroups: Array<CanonicalTask[] | undefined>) {
  const taskMap = new Map<string, CanonicalTask>();
  for (const group of taskGroups) {
    for (const task of group ?? []) {
      taskMap.set(task.taskId, task);
    }
  }
  return Array.from(taskMap.values());
}

function isFollowUpTask(task: CanonicalTask | undefined): task is FollowUpTask {
  return Boolean(task && task.taskType === "follow_up");
}

function uniqueTexts(items: Array<string | undefined>, limit = 5) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function buildTaskContext(payload: AiFollowUpPayload) {
  if (payload.scope === "institution" || !("child" in payload.snapshot)) {
    return {
      activeTask: payload.activeTask,
      tasks: payload.tasks ?? [],
      currentInterventionCard: payload.currentInterventionCard,
      followUpTask:
        payload.tasks?.find(
          (task): task is FollowUpTask => task.ownerRole === "teacher" && task.taskType === "follow_up"
        ) ??
        (isFollowUpTask(payload.activeTask) && payload.activeTask.ownerRole === "teacher"
          ? payload.activeTask
          : undefined),
    };
  }

  const derivedTasks = payload.currentInterventionCard
    ? buildTasksFromFollowUpCardContext({
        childId: payload.snapshot.child.id,
        currentInterventionCard: payload.currentInterventionCard,
        createdAt: payload.activeTask?.createdAt,
        updatedAt: payload.activeTask?.updatedAt,
        legacyWeeklyTaskId: payload.activeTask?.legacyRefs?.legacyWeeklyTaskId,
      }).tasks
    : [];
  const tasks = mergeTasks(payload.tasks, derivedTasks);
  const activeTask =
    payload.activeTask ??
    pickActiveTask(tasks, payload.snapshot.child.id, "parent") ??
    pickActiveTask(tasks, payload.snapshot.child.id);

  return {
    activeTask,
    tasks,
    currentInterventionCard:
      payload.currentInterventionCard ??
      (activeTask
        ? buildCurrentInterventionCardFromTask({
            activeTask,
            relatedTasks: tasks,
          })
        : undefined),
    followUpTask: tasks.find(
      (task): task is FollowUpTask => task.ownerRole === "teacher" && task.taskType === "follow_up"
    ),
  };
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authResult instanceof Response) return authResult;

  let payload: AiFollowUpPayload | null = null;

  try {
    payload = (await request.json()) as AiFollowUpPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.follow_up.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidFollowUpPayload(payload)) {
    return NextResponse.json({ error: "Invalid follow-up payload" }, { status: 400 });
  }

  const childSnapshot =
    payload.scope !== "institution" && "child" in payload.snapshot
      ? payload.snapshot
      : null;
  const isChildScoped = childSnapshot !== null;
  const childId = childSnapshot?.child.id ?? null;
  if (!childId) {
    return aiRouteLimitedResponse({
      reason: "scope_required",
      error: "Child scope is required for parent follow-up.",
      requiredRole: "parent",
    });
  }

  const sessionScope = await getSessionScope(authResult.session);
  try {
    requireScopedChild(sessionScope, childId);
  } catch (error) {
    if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
      return aiRouteLimitedResponse({
        reason: "forbidden_child",
        error: "Current account cannot access this child follow-up scope.",
        requiredRole: "parent",
      });
    }
    throw error;
  }
  const trustedChildSnapshot = buildChildSuggestionSnapshotFromScope(sessionScope, childId);
  if (!trustedChildSnapshot) {
    return aiRouteLimitedResponse({
      reason: "forbidden_child",
      error: "Current account cannot access this child follow-up scope.",
      requiredRole: "parent",
    });
  }
  const serviceScope = buildServiceScopeClaim(sessionScope);
  const trustedPayloadBase = buildParentFollowUpPayloadFromScope(payload, sessionScope, trustedChildSnapshot);
  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(trustedPayloadBase),
  });

  const brainForward = await forwardBrainRequest(brainRequest, "/api/v1/agents/parent/follow-up", {
    serviceScope,
  });
  if (brainForward.response?.ok || (brainForward.response && !isChildScoped)) {
    return brainForward.response;
  }

  const taskContext = buildTaskContext(trustedPayloadBase);
  const feedbackConsumption =
    !trustedChildSnapshot
      ? {
          feedback: undefined,
          summary: undefined,
          continuitySignals: [] as string[],
          openLoops: [] as string[],
          primaryActionSupport: undefined,
        }
      : selectStructuredFeedbackConsumption(
          [trustedPayloadBase.latestFeedback, trustedChildSnapshot.recentDetails?.feedback],
          {
            childId: trustedChildSnapshot.child.id,
            relatedTaskId: taskContext.activeTask?.taskId,
            relatedConsultationId:
              taskContext.currentInterventionCard?.consultationId ??
              trustedPayloadBase.currentInterventionCard?.consultationId ??
              trustedPayloadBase.latestFeedback?.relatedConsultationId,
            interventionCardId: taskContext.currentInterventionCard?.id ?? trustedPayloadBase.currentInterventionCard?.id,
          }
        );

  const sessionId =
    feedbackConsumption.feedback?.relatedConsultationId ??
    taskContext.currentInterventionCard?.consultationId ??
    trustedPayloadBase.currentInterventionCard?.consultationId;
  let memoryContext: Awaited<ReturnType<typeof buildMemoryContextForPrompt>> | null = null;
  if (isChildScoped) {
    try {
      memoryContext = await buildMemoryContextForPrompt({
        childId: trustedChildSnapshot.child.id,
        workflowType: "parent-follow-up",
        query: trustedPayloadBase.question,
        sessionId,
        request,
        serviceScope,
      });
    } catch (error) {
      logSecurityEvent("warn", "ai.follow_up.memory_fallback", { error });
    }
  }

  const nextPayload =
    !trustedChildSnapshot || !memoryContext
      ? trustedPayloadBase
      : {
          ...trustedPayloadBase,
          snapshot: {
            ...trustedChildSnapshot,
            memoryContext: memoryContext.promptContext,
            continuityNotes:
              trustedChildSnapshot.continuityNotes ??
              uniqueTexts([
                `参考了${trustedChildSnapshot.child.name}的长期与近期连续上下文。`,
                feedbackConsumption.summary,
                ...feedbackConsumption.continuitySignals,
                ...feedbackConsumption.openLoops,
              ]),
          },
          memoryContext: memoryContext.promptContext,
          continuityNotes: uniqueTexts([
            ...(trustedPayloadBase.continuityNotes ?? []),
            feedbackConsumption.summary,
            ...feedbackConsumption.continuitySignals,
            ...feedbackConsumption.openLoops,
          ]),
        };

  const taskAwarePayload = {
    ...nextPayload,
    latestFeedback: feedbackConsumption.feedback,
    activeTask: taskContext.activeTask,
    tasks: taskContext.tasks,
    currentInterventionCard: taskContext.currentInterventionCard ?? nextPayload.currentInterventionCard,
  } satisfies AiFollowUpPayload;

  let result: AiFollowUpResponse;
  try {
    result = await executeFollowUp(taskAwarePayload, getAiRuntimeOptions(request));
  } catch (error) {
    if (isAiProviderUnavailableError(error)) {
      return NextResponse.json(buildAiProviderUnavailableBody(error), { status: error.status });
    }
    throw error;
  }

  let consultation: Awaited<ReturnType<typeof maybeRunHighRiskConsultation>> | null = null;
  if (isChildScoped) {
    try {
      consultation = await maybeRunHighRiskConsultation(
        buildConsultationInputFromSnapshot({
          snapshot: taskAwarePayload.snapshot as ChildSuggestionSnapshot,
          latestFeedback: taskAwarePayload.latestFeedback,
          currentInterventionCard: taskAwarePayload.currentInterventionCard,
          activeTaskId: taskContext.activeTask?.taskId,
          question: trustedPayloadBase.question,
          followUp: result,
          source: "api",
          memoryContext,
        })
      );
    } catch (error) {
      logSecurityEvent("warn", "ai.follow_up.consultation_fallback", { error });
    }
  }

  if (consultation) {
    return NextResponse.json(
      {
        ...result,
        followUpTask: result.followUpTask ?? taskContext.followUpTask,
        tasks: result.tasks ?? taskContext.tasks,
        consultation,
        continuityNotes: result.continuityNotes ?? consultation.continuityNotes,
        ...(process.env.NODE_ENV !== "production" || request.headers.get("x-debug-memory") === "1"
          ? { memoryMeta: result.memoryMeta ?? consultation.memoryMeta ?? memoryContext?.meta }
          : {}),
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ...result,
      followUpTask: result.followUpTask ?? taskContext.followUpTask,
      tasks: result.tasks ?? taskContext.tasks,
      ...(process.env.NODE_ENV !== "production" || request.headers.get("x-debug-memory") === "1"
        ? { memoryMeta: result.memoryMeta ?? memoryContext?.meta }
        : {}),
    },
    { status: 200 }
  );
}
