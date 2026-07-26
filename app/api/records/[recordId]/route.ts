import { handleRecord } from "@/lib/server/api-handlers";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

export const runtime = "nodejs";

type Context = { params: Promise<{ recordId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { recordId } = await context.params;
  return handleRecord(
    await sanitizeAiPersistenceRequest(request, "record", { recordId }),
    recordId
  );
}
