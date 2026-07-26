import { handleRecords } from "@/lib/server/api-handlers";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleRecords(request);
}

export async function POST(request: Request) {
  return handleRecords(
    await sanitizeAiPersistenceRequest(request, "record")
  );
}
