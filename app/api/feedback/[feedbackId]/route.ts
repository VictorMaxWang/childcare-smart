import { handleFeedback } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ feedbackId: string }> };

export async function GET(request: Request, context: Context) {
  const { feedbackId } = await context.params;
  return handleFeedback(request, feedbackId);
}

export async function PATCH(request: Request, context: Context) {
  const { feedbackId } = await context.params;
  return handleFeedback(request, feedbackId);
}
