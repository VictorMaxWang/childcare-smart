import { handleStorybooks } from "@/lib/server/api-handlers";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleStorybooks(request);
}

export async function POST(request: Request) {
  return handleStorybooks(
    await sanitizeAiPersistenceRequest(request, "storybook")
  );
}
