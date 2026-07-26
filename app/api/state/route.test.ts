import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";

const parentUser = {
  id: "u-parent",
  username: "+8613800000000",
  name: "测试家长",
  role: "家长",
  avatar: "家",
  institutionId: "inst-family",
  childIds: ["c-1"],
  accountKind: "normal",
} satisfies SessionUser;

test("normal accounts cannot replace the institution snapshot through the legacy state endpoint", async () => {
  const route = (await import("./route.ts")) as typeof import("./route.ts") & {
    handleStatePut?: (
      request: Request,
      dependencies: { resolveUser: () => Promise<SessionUser | null> }
    ) => Promise<Response>;
  };

  assert.equal(typeof route.handleStatePut, "function");
  const response = await route.handleStatePut!(
    new Request("http://localhost:3000/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { health: [{ id: "forged" }] } }),
    }),
    { resolveUser: async () => parentUser }
  );
  const body = (await response.json()) as { ok?: boolean; code?: string };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(body.ok, false);
  assert.equal(body.code, "snapshot_write_disabled");
});
