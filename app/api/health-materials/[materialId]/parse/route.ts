import { handleHealthMaterialUpdate } from "@/lib/server/api-handlers";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

export const runtime = "nodejs";

type Context = { params: Promise<{ materialId: string }> };

export async function POST(request: Request, context: Context) {
  const { materialId } = await context.params;
  return handleHealthMaterialUpdate(
    await sanitizeAiPersistenceRequest(request, "health-parse", {
      healthMaterialId: materialId,
    }),
    materialId
  );
}
