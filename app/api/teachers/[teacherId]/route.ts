import { handleTeacher } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ teacherId: string }> };

export async function GET(request: Request, context: Context) {
  const { teacherId } = await context.params;
  return handleTeacher(request, teacherId);
}

export async function PATCH(request: Request, context: Context) {
  const { teacherId } = await context.params;
  return handleTeacher(request, teacherId);
}
