import { after } from "next/server";
import { apiOk, withApiErrors } from "@/lib/server/api-errors";
import { getCourseRecommendationJob, parentCourseScope, runCourseRecommendationJob } from "@/lib/server/parent-course-service";
export const runtime = "nodejs";
export const maxDuration = 180;
export function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withApiErrors(async () => {
    const scope = await parentCourseScope(request), { jobId } = await context.params;
    const job = await getCourseRecommendationJob(scope, jobId);
    // 只恢复尚未发送上游的已授权意图；running/unknown 不会因刷新而重新付费。
    if (job.status === "pending") after(() => runCourseRecommendationJob(scope, jobId));
    return apiOk(job, { headers: { "cache-control": "private, no-store" } });
  });
}
