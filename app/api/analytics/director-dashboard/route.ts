import { handleDirectorDashboard } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleDirectorDashboard(request);
}
