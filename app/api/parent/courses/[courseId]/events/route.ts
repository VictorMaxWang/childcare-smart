import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import { parentCourseScope, saveCourseLearning } from "@/lib/server/parent-course-service";
export const runtime = "nodejs";
export function POST(request: Request, context: { params: Promise<{ courseId: string }> }) {
  return withApiErrors(async () => {
    const scope = await parentCourseScope(request);
    const { courseId } = await context.params;
    return apiOk(await saveCourseLearning(scope, courseId, await readJsonBody(request)), { status: 201, headers: { "cache-control": "private, no-store" } });
  });
}
