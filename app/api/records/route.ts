import { handleRecords } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleRecords(request);
}

export function POST(request: Request) {
  return handleRecords(request);
}
