import { NextResponse } from "next/server.js";
import {
  executeFollowUp,
  executeSuggestion,
  executeWeeklyReport,
  getAiRuntimeOptions,
} from "@/lib/ai/server";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherChildSuggestionSnapshotWithMemory,
  buildTeacherCommunicationFollowUpPayloadWithMemory,
  buildTeacherCommunicationResultWithMemory,
  buildTeacherFollowUpResultWithMemory,
  buildTeacherWeeklyReportSnapshotWithMemory,
  buildTeacherWeeklySummaryResultWithMemory,
  type TeacherAgentRequestPayload,
  type TeacherAgentWorkflowType,
} from "@/lib/agent/teacher-agent";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { attachConsultationToInterventionCard } from "@/lib/agent/intervention-card";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";

function isRecordArray(value: unknown) {
  return Array.isArray(value);
}

function isValidWorkflow(value: unknown): value is TeacherAgentWorkflowType {
  return value === "communication" || value === "follow-up" || value === "weekly-summary";
}

function isValidPayload(payload: unknown): payload is TeacherAgentRequestPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;

  return (
    isValidWorkflow(obj.workflow) &&
    (obj.scope === "class" || obj.scope === "child") &&
    obj.currentUser !== null &&
    typeof obj.currentUser === "object" &&
    isRecordArray(obj.visibleChildren) &&
    isRecordArray(obj.presentChildren) &&
    isRecordArray(obj.healthCheckRecords) &&
    isRecordArray(obj.growthRecords) &&
    isRecordArray(obj.guardianFeedbacks)
  );
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/teacher/run");
  if (brainForward.response) return brainForward.response;

  let payload: TeacherAgentRequestPayload | null = null;

  try {
    payload = (await request.json()) as TeacherAgentRequestPayload;
  } catch (error) {
    console.error("[AI] Invalid teacher-agent payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid teacher-agent payload" }, { status: 400 });
  }

  const classContext = buildTeacherAgentClassContext(payload);
  const childContext = buildTeacherAgentChildContext(classContext, payload.targetChildId);
  const runtimeOptions = getAiRuntimeOptions(request);
  const memoryContext =
    payload.workflow !== "weekly-summary" && childContext
      ? await buildMemoryContextForPrompt({
        childId: childContext.child.id,
        workflowType: "teacher-agent",
        query: childContext.focusReasons.join(" "),
        request,
      })
      : null;
  const weeklyMemoryContexts =
    payload.workflow === "weekly-summary"
      ? await Promise.all(
          (classContext.focusChildren.map((item) => item.childId).slice(0, 3).length > 0
            ? classContext.focusChildren.map((item) => item.childId).slice(0, 3)
            : payload.visibleChildren.map((item) => item.id).slice(0, 3)
          ).map((childId) =>
            buildMemoryContextForPrompt({
              childId,
              workflowType: "teacher-weekly-summary",
              query: "weekly report focus child continuity",
              request,
            })
          )
        )
      : [];

  if (payload.workflow === "communication") {
    if (!childContext) {
      return NextResponse.json({ error: "No visible child available for communication workflow" }, { status: 400 });
    }

    const aiResponse = await executeFollowUp(
      buildTeacherCommunicationFollowUpPayloadWithMemory(childContext, memoryContext),
      runtimeOptions
    );
    const baseResult = buildTeacherCommunicationResultWithMemory({
      context: childContext,
      response: aiResponse,
      memoryContext,
    });
    const consultation = await maybeRunHighRiskConsultation(
      buildConsultationInputFromSnapshot({
        snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext),
        latestFeedback: childContext.latestFeedback
          ? (toFollowUpFeedbackLite(childContext.latestFeedback) ?? undefined)
          : undefined,
        focusReasons: childContext.focusReasons,
        followUp: aiResponse,
        source: "teacher",
        memoryContext,
      })
    );
    const result = consultation
      ? {
          ...baseResult,
          consultation,
          consultationMode: true,
          interventionCard: attachConsultationToInterventionCard(baseResult.interventionCard, consultation),
        }
      : baseResult;

    return NextResponse.json(result, { status: 200 });
  }

  if (payload.workflow === "follow-up") {
    if (!childContext) {
      return NextResponse.json({ error: "No visible child available for follow-up workflow" }, { status: 400 });
    }

    const aiSuggestion = await executeSuggestion(
      { snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext) },
      runtimeOptions
    );
    const baseResult = buildTeacherFollowUpResultWithMemory({
      classContext,
      childContext,
      suggestion: aiSuggestion,
      memoryContext,
    });
    const consultation = await maybeRunHighRiskConsultation(
      buildConsultationInputFromSnapshot({
        snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext),
        latestFeedback: childContext.latestFeedback
          ? (toFollowUpFeedbackLite(childContext.latestFeedback) ?? undefined)
          : undefined,
        focusReasons: childContext.focusReasons,
        suggestion: aiSuggestion,
        source: "teacher",
        memoryContext,
      })
    );
    const result = consultation
      ? {
          ...baseResult,
          consultation,
          consultationMode: true,
          interventionCard: attachConsultationToInterventionCard(baseResult.interventionCard, consultation),
        }
      : baseResult;

    return NextResponse.json(result, { status: 200 });
  }

  const aiReport = await executeWeeklyReport(
    {
      role: "teacher",
      snapshot: buildTeacherWeeklyReportSnapshotWithMemory(classContext, weeklyMemoryContexts),
    },
    runtimeOptions
  );
  const result = buildTeacherWeeklySummaryResultWithMemory({
    classContext,
    report: aiReport,
    memoryContexts: weeklyMemoryContexts,
  });

  return NextResponse.json(result, { status: 200 });
}
