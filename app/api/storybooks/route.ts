import { handleStorybooks } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleStorybooks(request);
}

export function POST(request: Request) {
  return handleStorybooks(request);
}
