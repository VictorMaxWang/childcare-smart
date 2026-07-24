import { apiPost } from "@/lib/api/client";
import type { AccountRole } from "@/lib/auth/accounts";

export type BindableMemberRole = Extract<AccountRole, "教师" | "家长">;

export interface CreateMemberInvitationPayload {
  role: BindableMemberRole;
  className: string;
  teacherId?: string;
}

export interface CreatedMemberInvitation {
  invitationId: string;
  code: string;
  role: BindableMemberRole;
  classId: string;
  className: string;
  expiresAt: string;
}

export interface AcceptedMemberInvitation {
  institutionId: string;
  role: BindableMemberRole;
  classId: string;
  className: string;
  childIds: string[];
  migratedChildCount: number;
}

export function createMemberInvitation(input: CreateMemberInvitationPayload) {
  return apiPost<CreatedMemberInvitation>("/api/admin/member-invitations", input);
}

export function acceptMemberInvitation(code: string) {
  return apiPost<AcceptedMemberInvitation>(
    "/api/account/member-invitations/accept",
    { code }
  );
}
