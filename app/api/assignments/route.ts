import { handleAssignments } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleAssignments(request);
}

export function POST(request: Request) {
  return handleAssignments(request);
}
