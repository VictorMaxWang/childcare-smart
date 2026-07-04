import { apiPost } from "@/lib/api/client";
import type { ApiChild, ApiParentChildOnboardingInput } from "@/lib/api/types";

export function createParentChildWithConsent(input: ApiParentChildOnboardingInput) {
  return apiPost<ApiChild>("/api/parent/children", input);
}
