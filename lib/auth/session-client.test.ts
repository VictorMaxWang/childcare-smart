import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import { loadClientSession } from "@/lib/auth/session-client";

const user: SessionUser = {
  id: "u-session-test",
  name: "会话测试账号",
  role: "家长",
  avatar: "",
  institutionId: "inst-session-test",
  childIds: ["c-session-test"],
  accountKind: "normal",
};

test("client session distinguishes authenticated, unauthenticated, and unavailable states", async () => {
  const authenticated = await loadClientSession(async () =>
    Response.json({ ok: true, user })
  );
  assert.deepEqual(authenticated, { status: "authenticated", user });

  const unauthenticated = await loadClientSession(async () =>
    Response.json({ ok: false, user: null }, { status: 401 })
  );
  assert.deepEqual(unauthenticated, { status: "unauthenticated" });

  const unavailable = await loadClientSession(async () =>
    Response.json(
      { ok: false, user: null, error: "数据库暂不可用。" },
      { status: 503 }
    )
  );
  assert.deepEqual(unavailable, {
    status: "unavailable",
    message: "数据库暂不可用。",
  });
});

test("client session treats network failures as retryable instead of logout", async () => {
  const result = await loadClientSession(async () => {
    throw new TypeError("fetch failed");
  });

  assert.deepEqual(result, {
    status: "unavailable",
    message: "暂时无法连接登录服务，请稍后重试。",
  });
});
