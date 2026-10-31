import { apiOk, withApiErrors } from "@/lib/server/api-errors";
import { getParentCourses, parentCourseScope } from "@/lib/server/parent-course-service";
export const runtime = "nodejs";
export function GET(request: Request) {
  return withApiErrors(async () => apiOk(await getParentCourses(await parentCourseScope(request), new URL(request.url).searchParams.get("child")), { headers: { "cache-control": "private, no-store" } }));
}
