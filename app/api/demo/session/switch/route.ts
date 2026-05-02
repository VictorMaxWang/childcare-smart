import { handleDemoSessionSwitch } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleDemoSessionSwitch(request);
}
