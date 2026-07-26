import { handleConsultations } from "@/lib/server/api-handlers";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleConsultations(request);
}

export async function POST(request: Request) {
  return handleConsultations(
    await sanitizeAiPersistenceRequest(request, "consultation")
  );
}
