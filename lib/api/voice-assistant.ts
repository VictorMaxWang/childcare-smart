import { apiGet, apiPost } from "@/lib/api/client";
import type {
  AssistantCommand,
  AssistantExecuteResult,
  AssistantPlanResult,
  AssistantProviderStatus,
  AssistantUtterance,
  VoiceAsrResponse,
} from "@/lib/voice-assistant/types";

export function getVoiceAssistantProviderStatus() {
  return apiGet<AssistantProviderStatus>("/api/ai/provider-status");
}

export function planVoiceAssistantCommand(params: {
  utterance: AssistantUtterance;
  currentPath?: string;
  currentQuery?: Record<string, string | undefined>;
  objects?: Record<string, string | undefined>;
}) {
  return apiPost<AssistantPlanResult>("/api/voice-assistant/commands", {
    action: "plan",
    utterance: params.utterance,
    context: {
      currentPath: params.currentPath,
      currentQuery: params.currentQuery,
      objects: params.objects,
    },
  });
}

export function executeVoiceAssistantCommand(params: {
  command: AssistantCommand;
  confirmed?: boolean;
  currentPath?: string;
  currentQuery?: Record<string, string | undefined>;
  objects?: Record<string, string | undefined>;
}) {
  return apiPost<AssistantExecuteResult>("/api/voice-assistant/commands", {
    action: "execute",
    command: params.command,
    confirmed: params.confirmed,
    context: {
      currentPath: params.currentPath,
      currentQuery: params.currentQuery,
      objects: params.objects,
    },
  });
}

export async function transcribeVoiceAssistantAudio(formData: FormData) {
  const response = await fetch("/api/ai/voice-asr", {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: VoiceAsrResponse }
    | { ok: false; error: string; code: string }
    | null;

  if (!body || body.ok !== true) {
    throw new Error(body && body.ok === false ? body.error : `ASR failed with ${response.status}`);
  }

  return body.data;
}
