import { handleAssignment } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ assignmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { assignmentId } = await context.params;
  return handleAssignment(request, assignmentId);
}
