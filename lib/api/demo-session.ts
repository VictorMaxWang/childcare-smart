import { apiGet, apiPost } from "@/lib/api/client";
import type { DemoSessionData } from "@/lib/api/types";

export function getDemoSession(demoAccountId?: string) {
  return apiGet<DemoSessionData>("/api/demo/session", { demoAccountId });
}

export function switchDemoSession(accountId: string) {
  return apiPost<DemoSessionData>("/api/demo/session/switch", { accountId });
}
