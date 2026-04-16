import { NextResponse } from "next/server";
import { forwardBrainRequest } from "@/lib/server/brain-client";

export async function POST(request: Request) {
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
