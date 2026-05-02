import { handleHealthMaterials } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleHealthMaterials(request);
}

export function POST(request: Request) {
  return handleHealthMaterials(request);
}
