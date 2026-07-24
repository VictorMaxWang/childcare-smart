import type { AcceptMemberInvitationInput } from "@/lib/server/institution-membership";
import {
  acceptMemberInvitation,
} from "@/lib/server/institution-membership";
import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import { requireSession, type RequestSession } from "@/lib/server/session";

export const runtime = "nodejs";

export interface AcceptMemberInvitationRouteDependencies {
  resolveSession(request: Request): Promise<RequestSession>;
  acceptInvitation: typeof acceptMemberInvitation;
}

const defaultDependencies: AcceptMemberInvitationRouteDependencies = {
  resolveSession: requireSession,
  acceptInvitation: acceptMemberInvitation,
};

export function handleAcceptMemberInvitationRequest(
  request: Request,
  dependencies: AcceptMemberInvitationRouteDependencies = defaultDependencies
) {
  return withApiErrors(async () => {
    const session = await dependencies.resolveSession(request);
    const input = await readJsonBody<AcceptMemberInvitationInput>(request);
    return apiOk(await dependencies.acceptInvitation(session.user, input));
  });
}

export function POST(request: Request) {
  return handleAcceptMemberInvitationRequest(request);
}
