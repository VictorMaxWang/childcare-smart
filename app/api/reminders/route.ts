import { handleReminders } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleReminders(request);
}

export function POST(request: Request) {
  return handleReminders(request);
}
