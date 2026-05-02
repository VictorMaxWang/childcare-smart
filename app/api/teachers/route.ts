import { handleTeachers } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleTeachers(request);
}

export function POST(request: Request) {
  return handleTeachers(request);
}
