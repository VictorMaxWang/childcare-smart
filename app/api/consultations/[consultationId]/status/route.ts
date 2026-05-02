import { handleConsultationStatus } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ consultationId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { consultationId } = await context.params;
  return handleConsultationStatus(request, consultationId);
}
