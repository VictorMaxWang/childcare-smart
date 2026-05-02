import { handleReminder } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ reminderId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { reminderId } = await context.params;
  return handleReminder(request, reminderId);
}
