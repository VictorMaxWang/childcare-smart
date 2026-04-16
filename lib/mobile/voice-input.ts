import type { MobileDraft } from "@/lib/ai/types";
import { createMobileDraft } from "@/lib/mobile/local-draft-cache";
import type { VoiceUploadResponse } from "@/lib/mobile/voice-assistant-upload";
import type { TeacherVoiceUnderstandResponse } from "@/lib/ai/teacher-voice-understand";
import type { TeacherVoiceGlueResult } from "@/lib/mobile/teacher-voice-understand";
import type {
  TeacherDraftConfirmationState,
  TeacherDraftUnderstandingSeed,
} from "@/lib/mobile/teacher-draft-records";
import type { TeacherCopilotPayload } from "@/lib/teacher-copilot/types";

export function buildMockVoiceDraft(params: {
  childId: string;
  targetRole: MobileDraft["targetRole"];
  childName: string;
  scenario: "teacher-observation" | "parent-feedback";
}): MobileDraft {
  const transcript =
    params.scenario === "teacher-observation"
      ? `${params.childName} 今天晨检后情绪偏低，午睡前需要再看一次体温和饮水，先记成重点观察。`
      : `${params.childName} 今晚先执行了补水和安抚动作，孩子一开始有点抗拒，后面配合度有所提升。`;

  return createMobileDraft({
    childId: params.childId,
    draftType: "voice",
    targetRole: params.targetRole,
    content: transcript,
    structuredPayload: {
      transcript,
      scenario: params.scenario,
      source: "mock-voice",
    },
  });
}

export interface TeacherVoiceDraftPayload extends Record<string, unknown> {
  kind: "teacher-voice-understanding";
  childName?: string;
  transcript: string;
  copilot?: TeacherCopilotPayload | Record<string, unknown> | null;
  recordCompletionHints?: TeacherCopilotPayload["recordCompletionHints"];
  microTrainingSOP?: TeacherCopilotPayload["microTrainingSOP"];
  parentCommunicationScript?: TeacherCopilotPayload["parentCommunicationScript"];
  upload: {
    assetId?: string;
    transcript?: string;
    draftContent: string;
    provider?: string;
    source: VoiceUploadResponse["source"];
    status: VoiceUploadResponse["status"];
    nextAction: NonNullable<VoiceUploadResponse["nextAction"]>;
    raw?: Record<string, unknown>;
    recordingMeta?: TeacherVoiceGlueResult["recordingMeta"];
  };
  understanding: TeacherVoiceUnderstandResponse | null;
  understandingError: string | null;
  t5Seed: TeacherDraftUnderstandingSeed;
  t5State?: TeacherDraftConfirmationState;
}

export function createTeacherVoiceDraftPayload(params: {
  childName?: string;
  transcript: string;
  upload: Partial<TeacherVoiceDraftPayload["upload"]> & {
    draftContent: string;
    source: VoiceUploadResponse["source"];
    status: VoiceUploadResponse["status"];
    nextAction?: NonNullable<VoiceUploadResponse["nextAction"]>;
  };
  understanding: TeacherVoiceUnderstandResponse | null;
  understandingError?: string | null;
  t5Seed?: TeacherDraftUnderstandingSeed;
  t5State?: TeacherDraftConfirmationState;
}) {
  const transcript = params.transcript.trim() || params.upload.draftContent.trim();
  const t5Seed =
    params.t5Seed ??
    ({
      transcript,
      router_result: params.understanding?.router_result ?? null,
      draft_items: params.understanding?.draft_items ?? [],
      warnings: params.understanding?.warnings ?? [],
      copilot: params.understanding?.copilot,
      recordCompletionHints: params.understanding?.recordCompletionHints,
      microTrainingSOP: params.understanding?.microTrainingSOP,
      parentCommunicationScript: params.understanding?.parentCommunicationScript,
    } satisfies TeacherDraftUnderstandingSeed);

  return {
    kind: "teacher-voice-understanding",
    childName: params.childName,
    transcript,
    copilot: params.understanding?.copilot,
    recordCompletionHints: params.understanding?.recordCompletionHints,
    microTrainingSOP: params.understanding?.microTrainingSOP,
    parentCommunicationScript: params.understanding?.parentCommunicationScript,
    upload: {
      assetId: params.upload.assetId,
      transcript: params.upload.transcript,
      draftContent: params.upload.draftContent,
      provider: params.upload.provider,
      source: params.upload.source,
      status: params.upload.status,
      nextAction: params.upload.nextAction ?? "none",
      raw: params.upload.raw,
      recordingMeta: params.upload.recordingMeta,
    },
    understanding: params.understanding,
    understandingError: params.understandingError ?? null,
    t5Seed,
    t5State: params.t5State,
  } satisfies TeacherVoiceDraftPayload;
}

export function buildVoiceDraftFromUpload(params: {
  childId: string;
  childName?: string;
  targetRole: MobileDraft["targetRole"];
  result: TeacherVoiceGlueResult;
}) {
  const transcript =
    params.result.understanding?.transcript.text?.trim() ||
    params.result.upload.transcript?.trim() ||
    params.result.upload.draftContent.trim();
  const structuredPayload = createTeacherVoiceDraftPayload({
    childName: params.childName,
    transcript,
    upload: {
      assetId: params.result.upload.assetId,
      transcript: params.result.upload.transcript,
      draftContent: params.result.upload.draftContent,
      provider: params.result.upload.provider,
      source: params.result.upload.source,
      status: params.result.upload.status,
      nextAction: params.result.uiHintNextAction ?? "none",
      raw: params.result.upload.raw,
      recordingMeta: params.result.recordingMeta,
    },
    understanding: params.result.understanding,
    understandingError: params.result.understandingError,
  });

  return createMobileDraft({
    childId: params.childId,
    draftType: "voice",
    targetRole: params.targetRole,
    content: params.result.upload.draftContent,
    attachmentName: params.result.upload.attachmentName,
    structuredPayload,
  });
}

export function readTeacherVoiceDraftPayload(
  payload: Record<string, unknown> | undefined
): TeacherVoiceDraftPayload | null {
  if (
    !payload ||
    payload.kind !== "teacher-voice-understanding" ||
    typeof payload.transcript !== "string" ||
    !payload.upload ||
    typeof payload.upload !== "object" ||
    !payload.t5Seed ||
    typeof payload.t5Seed !== "object"
  ) {
    return null;
  }

  return payload as TeacherVoiceDraftPayload;
}

export function getVoiceDraftSyncStatus(result: TeacherVoiceGlueResult) {
  if (result.upload.status === "failed") return "failed" as const;
  if (result.upload.status === "processing") return "local_pending" as const;
  if (!result.understanding) return "local_pending" as const;
  return "synced" as const;
}
