import { apiOk, ApiRouteError, withApiErrors } from "@/lib/server/api-errors";
import { getParentCourses, parentCourseScope } from "@/lib/server/parent-course-service";
export const runtime = "nodejs";
export function GET(request: Request, context: { params: Promise<{ courseId: string }> }) {
  return withApiErrors(async () => {
    const { courseId } = await context.params;
    const result = await getParentCourses(await parentCourseScope(request), new URL(request.url).searchParams.get("child"));
    const course = result.courses.find(item => item.id === courseId);
    if (!course) throw new ApiRouteError("not_found", "未找到适龄课程。");
    return apiOk({ course, learning: result.learning.filter(event => event.courseId === courseId) }, { headers: { "cache-control": "private, no-store" } });
  });
}
