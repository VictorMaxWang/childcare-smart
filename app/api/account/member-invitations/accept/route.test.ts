import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import {
  handleAcceptMemberInvitationRequest,
  type AcceptMemberInvitationRouteDependencies,
} from "@/app/api/account/member-invitations/accept/route";

const teacher: SessionUser = {
  id: "u-teacher",
  name: "测试教师",
  role: "教师",
  avatar: "",
  institutionId: "inst-trial",
  className: "新注册班",
  accountKind: "normal",
};

test("member invitation accept route binds the authenticated account only", async () => {
  let receivedUserId = "";
  let receivedCode = "";
  const dependencies: AcceptMemberInvitationRouteDependencies = {
    async resolveSession() {
      return { user: teacher, source: "cookie" };
    },
    async acceptInvitation(session, input) {
      receivedUserId = session.id;
      receivedCode = input.code;
      return {
        institutionId: "inst-main",
        role: "教师",
        classId: "class-1",
        className: "向阳班",
        childIds: [],
        migratedChildCount: 0,
      };
    },
  };

  const response = await handleAcceptMemberInvitationRequest(
    new Request("https://example.test/api/account/member-invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "ABCD-EFGH-JKLM",
        userId: "client-forged-user",
      }),
    }),
    dependencies
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(receivedUserId, "u-teacher");
  assert.equal(receivedCode, "ABCD-EFGH-JKLM");
});
