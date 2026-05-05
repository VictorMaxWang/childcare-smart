import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import {
  executePlannedAssistantCommand,
  planAssistantCommand,
} from "@/lib/voice-assistant/command-bus";
import type { AssistantCommandApiRequest } from "@/lib/voice-assistant/types";

export const runtime = "nodejs";

export function POST(request: Request) {
  return withApiErrors(async () => {
    const body = await readJsonBody<AssistantCommandApiRequest>(request);
    if (body.action === "plan") {
      return apiOk(await planAssistantCommand(request, body));
    }
    if (body.action === "execute") {
      return apiOk(await executePlannedAssistantCommand(request, body));
    }
    return apiOk(await planAssistantCommand(request, body));
  });
}
