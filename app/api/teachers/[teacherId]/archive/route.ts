import { handleTeacherArchive } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ teacherId: string }> };

export async function POST(request: Request, context: Context) {
  const { teacherId } = await context.params;
  return handleTeacherArchive(request, teacherId);
}
