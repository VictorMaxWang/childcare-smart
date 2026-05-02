import { handleAttachments } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleAttachments(request);
}

export function POST(request: Request) {
  return handleAttachments(request);
}
