import { handleConsultationNote } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ consultationId: string }> };

export async function POST(request: Request, context: Context) {
  const { consultationId } = await context.params;
  return handleConsultationNote(request, consultationId);
}
