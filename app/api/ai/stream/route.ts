import { createMockBrainStreamResponse, forwardBrainRequest } from "@/lib/server/brain-client";

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/stream/agent");
  if (brainForward.response) return brainForward.response;
  return createMockBrainStreamResponse();
}
