import { handleMessages } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleMessages(request);
}

export function POST(request: Request) {
  return handleMessages(request);
}
