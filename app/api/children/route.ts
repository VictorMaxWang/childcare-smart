import { handleChildren } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleChildren(request);
}

export function POST(request: Request) {
  return handleChildren(request);
}
