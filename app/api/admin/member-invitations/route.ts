import type { CreateMemberInvitationInput } from "@/lib/server/institution-membership";
import {
  createMemberInvitation,
} from "@/lib/server/institution-membership";
import { apiOk, readJsonBody, withApiErrors } from "@/lib/server/api-errors";
import { requireSession, type RequestSession } from "@/lib/server/session";

export const runtime = "nodejs";

export interface CreateMemberInvitationRouteDependencies {
  resolveSession(request: Request): Promise<RequestSession>;
  createInvitation: typeof createMemberInvitation;
}

const defaultDependencies: CreateMemberInvitationRouteDependencies = {
  resolveSession: requireSession,
  createInvitation: createMemberInvitation,
};

export function handleCreateMemberInvitationRequest(
  request: Request,
  dependencies: CreateMemberInvitationRouteDependencies = defaultDependencies
) {
  return withApiErrors(async () => {
    const session = await dependencies.resolveSession(request);
    const input = await readJsonBody<CreateMemberInvitationInput>(request);
    const invitation = await dependencies.createInvitation(session.user, input);
    return apiOk(invitation, { status: 201 });
  });
}

export function POST(request: Request) {
  return handleCreateMemberInvitationRequest(request);
}
