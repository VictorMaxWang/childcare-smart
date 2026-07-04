import type { ApiParentChildOnboardingInput } from "@/lib/api/types";
import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import { requireSession, type RequestSession } from "@/lib/server/session";
import {
  createParentChildWithConsent,
  type ParentChildOnboardingRequestMeta,
} from "@/lib/server/parent-child-onboarding";

export const runtime = "nodejs";

export type ParentChildrenRouteDependencies = {
  resolveSession: (request: Request) => Promise<RequestSession>;
  createChild: (
    session: RequestSession["user"],
    input: ApiParentChildOnboardingInput,
    requestMeta: ParentChildOnboardingRequestMeta
  ) => ReturnType<typeof createParentChildWithConsent>;
};

const defaultParentChildrenRouteDependencies: ParentChildrenRouteDependencies = {
  resolveSession: requireSession,
  createChild: createParentChildWithConsent,
};

function readRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || null;
}

export function handleParentChildrenRequest(
  request: Request,
  dependencies: ParentChildrenRouteDependencies = defaultParentChildrenRouteDependencies
) {
  return withApiErrors(async () => {
    const session = await dependencies.resolveSession(request);
    const body = await readJsonBody<ApiParentChildOnboardingInput>(request);
    const child = await dependencies.createChild(session.user, body, {
      ip: readRequestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return apiOk(child, { status: 201 });
  });
}

export function POST(request: Request) {
  return handleParentChildrenRequest(request);
}
