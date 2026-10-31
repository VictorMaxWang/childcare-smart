import { after } from "next/server";
import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import { createCourseRecommendationJob, parentCourseScope, runCourseRecommendationJob } from "@/lib/server/parent-course-service";
export const runtime = "nodejs";
export const maxDuration = 180;
export function POST(request: Request) {
  return withApiErrors(async () => {
    const scope = await parentCourseScope(request);
    const job = await createCourseRecommendationJob(scope, await readJsonBody(request));
    if (job.status === "pending") after(() => runCourseRecommendationJob(scope, job.jobId));
    return apiOk(job, { status: job.status === "completed" ? 200 : 202, headers: { "cache-control": "private, no-store" } });
  });
}
