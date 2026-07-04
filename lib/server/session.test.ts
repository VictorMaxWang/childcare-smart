import assert from "node:assert/strict";
import test from "node:test";

import { ApiRouteError } from "@/lib/server/api-errors";
import {
  DEMO_HEADER_DISABLED_IN_PRODUCTION_ERROR,
  isDemoHeaderSessionAllowed,
  resolveRequestSession,
} from "@/lib/server/session";

type EnvKey = "NODE_ENV" | "ONLINE_SMOKE_ALLOW_DEMO_HEADER";

async function withEnv(overrides: Partial<Record<EnvKey, string | undefined>>, fn: () => Promise<void> | void) {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previous: Partial<Record<EnvKey, string | undefined>> = {};

  for (const key of Object.keys(overrides) as EnvKey[]) {
    previous[key] = mutableEnv[key];
    const value = overrides[key];
    if (typeof value === "undefined") {
      delete mutableEnv[key];
    } else {
      mutableEnv[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const key of Object.keys(previous) as EnvKey[]) {
      const value = previous[key];
      if (typeof value === "undefined") {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }
  }
}

function demoHeaderRequest(accountId = "u-parent") {
  return new Request("http://localhost/api/demo/session", {
    headers: { "x-demo-account-id": accountId },
  });
}

test("production rejects demo header by default", async () => {
  await withEnv({ NODE_ENV: "production", ONLINE_SMOKE_ALLOW_DEMO_HEADER: undefined }, async () => {
    assert.equal(isDemoHeaderSessionAllowed(), false);

    await assert.rejects(
      () => resolveRequestSession(demoHeaderRequest()),
      (error: unknown) => {
        assert.ok(error instanceof ApiRouteError);
        assert.equal(error.code, "unauthorized");
        assert.equal(error.status, 401);
        assert.equal(error.message, DEMO_HEADER_DISABLED_IN_PRODUCTION_ERROR);
        return true;
      }
    );
  });
});

test("test environment allows demo header", async () => {
  await withEnv({ NODE_ENV: "test", ONLINE_SMOKE_ALLOW_DEMO_HEADER: undefined }, async () => {
    assert.equal(isDemoHeaderSessionAllowed(), true);

    const session = await resolveRequestSession(demoHeaderRequest());

    assert.equal(session?.source, "demo-header");
    assert.equal(session?.user.id, "u-parent");
  });
});

test("production allows demo header only when online smoke switch is explicit", async () => {
  await withEnv({ NODE_ENV: "production", ONLINE_SMOKE_ALLOW_DEMO_HEADER: "1" }, async () => {
    assert.equal(isDemoHeaderSessionAllowed(), true);

    const session = await resolveRequestSession(demoHeaderRequest("u-admin"));

    assert.equal(session?.source, "demo-header");
    assert.equal(session?.user.id, "u-admin");
  });
});
