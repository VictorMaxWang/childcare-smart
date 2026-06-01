import { apiOk, withApiErrors } from "@/lib/server/api-errors";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { getUnifiedAiProviderStatus } from "@/lib/server/ai-provider-status";

export const runtime = "nodejs";

export function GET(request: Request) {
  return withApiErrors(async () => {
    const authError = await authorizeAiRoute(request, { allowUnscoped: true });
    if (authError) return authError;
    return apiOk(getUnifiedAiProviderStatus());
  });
}
