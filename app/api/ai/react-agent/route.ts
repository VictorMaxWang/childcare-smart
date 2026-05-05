import { NextResponse } from "next/server";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { allowUnscoped: true });
  if (authError) return authError;

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/react/run");
  if (brainForward.response) return brainForward.response;

  return NextResponse.json(
    {
      ok: false,
      error: "React agent backend is unavailable.",
    },
    { status: 503 }
  );
}
