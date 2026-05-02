import { handleHealthMaterialUpdate } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ materialId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { materialId } = await context.params;
  return handleHealthMaterialUpdate(request, materialId);
}
