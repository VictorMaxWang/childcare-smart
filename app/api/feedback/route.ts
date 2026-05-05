import { handleFeedbackList } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleFeedbackList(request);
}

export function POST(request: Request) {
  return handleFeedbackList(request);
}
