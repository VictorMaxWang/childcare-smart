import { NextResponse } from "next/server";
import { executeFollowUp, getAiRuntimeOptions, isValidFollowUpPayload } from "@/lib/ai/server";
import type { AiFollowUpPayload, ChildSuggestionSnapshot } from "@/lib/ai/types";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { selectStructuredFeedbackConsumption } from "@/lib/feedback/consumption";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { requireParentChildAccess } from "@/lib/server/parent-route-guard";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";
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
  let payload: AiFollowUpPayload | null = null;

  try {
    payload = (await request.json()) as AiFollowUpPayload;
  } catch (error) {
    console.error("[AI] Invalid follow-up payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidFollowUpPayload(payload)) {
    return NextResponse.json({ error: "Invalid follow-up payload" }, { status: 400 });
  }

  const childId =
    payload.scope === "institution" || !("child" in payload.snapshot)
      ? null
      : payload.snapshot.child.id;
  const access = await requireParentChildAccess(childId);
  if (access.response) {
    return access.response;
  }

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/parent/follow-up");
  if (brainForward.response) return brainForward.response;

  const taskContext = buildTaskContext(payload);
  const feedbackConsumption =
    payload.scope === "institution" || !("child" in payload.snapshot)
      ? {
          feedback: undefined,
          summary: undefined,
          continuitySignals: [] as string[],
          openLoops: [] as string[],
          primaryActionSupport: undefined,
        }
      : selectStructuredFeedbackConsumption(
          [payload.latestFeedback, payload.snapshot.recentDetails?.feedback],
          {
            childId: payload.snapshot.child.id,
            relatedTaskId: taskContext.activeTask?.taskId,
            relatedConsultationId:
              taskContext.currentInterventionCard?.consultationId ??
              payload.currentInterventionCard?.consultationId ??
              payload.latestFeedback?.relatedConsultationId,
            interventionCardId: taskContext.currentInterventionCard?.id ?? payload.currentInterventionCard?.id,
          }
        );

  const sessionId =
    feedbackConsumption.feedback?.relatedConsultationId ??
    taskContext.currentInterventionCard?.consultationId ??
    payload.currentInterventionCard?.consultationId;
  const memoryContext =
    payload.scope === "institution" || !("child" in payload.snapshot)
      ? null
      : await buildMemoryContextForPrompt({
          childId: payload.snapshot.child.id,
          workflowType: "parent-follow-up",
          query: payload.question,
          sessionId,
          request,
        });

  const nextPayload =
    payload.scope === "institution" || !("child" in payload.snapshot) || !memoryContext
      ? payload
      : {
          ...payload,
          snapshot: {
            ...payload.snapshot,
            memoryContext: memoryContext.promptContext,
            continuityNotes:
              payload.snapshot.continuityNotes ??
              uniqueTexts([
                `参考了${payload.snapshot.child.name}的长期与近期连续上下文。`,
                feedbackConsumption.summary,
                ...feedbackConsumption.continuitySignals,
                ...feedbackConsumption.openLoops,
              ]),
          },
          memoryContext: memoryContext.promptContext,
          continuityNotes: uniqueTexts([
            ...(payload.continuityNotes ?? []),
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

  const result = await executeFollowUp(taskAwarePayload, getAiRuntimeOptions(request));
  const consultation =
    payload.scope === "institution"
      ? null
      : await maybeRunHighRiskConsultation(
          buildConsultationInputFromSnapshot({
            snapshot: taskAwarePayload.snapshot as ChildSuggestionSnapshot,
            latestFeedback: taskAwarePayload.latestFeedback,
            currentInterventionCard: taskAwarePayload.currentInterventionCard,
            activeTaskId: taskContext.activeTask?.taskId,
            question: payload.question,
            followUp: result,
            source: "api",
            memoryContext,
          })
        );

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
