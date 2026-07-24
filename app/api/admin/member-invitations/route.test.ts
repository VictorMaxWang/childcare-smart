import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import {
  handleCreateMemberInvitationRequest,
  type CreateMemberInvitationRouteDependencies,
} from "@/app/api/admin/member-invitations/route";

const admin: SessionUser = {
  id: "u-admin",
  name: "测试园长",
  role: "机构管理员",
  avatar: "",
  institutionId: "inst-main",
  accountKind: "normal",
};

test("admin invitation route uses the authenticated institution and returns the one-time code", async () => {
  let receivedInstitutionId = "";
  let receivedInput: unknown = null;
  const dependencies: CreateMemberInvitationRouteDependencies = {
    async resolveSession() {
      return { user: admin, source: "cookie" };
    },
    async createInvitation(session, input) {
      receivedInstitutionId = session.institutionId;
      receivedInput = input;
      return {
        invitationId: "invite-1",
        code: "ABCD-EFGH-JKLM",
        role: "教师",
        classId: "class-1",
        className: "向阳班",
        expiresAt: "2026-07-25T12:00:00.000Z",
      };
    },
  };

  const response = await handleCreateMemberInvitationRequest(
    new Request("https://example.test/api/admin/member-invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "教师",
        className: "向阳班",
        institutionId: "client-forged-inst",
      }),
    }),
    dependencies
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.data.code, "ABCD-EFGH-JKLM");
  assert.equal(receivedInstitutionId, "inst-main");
  assert.deepEqual(receivedInput, {
    role: "教师",
    className: "向阳班",
    institutionId: "client-forged-inst",
  });
});
