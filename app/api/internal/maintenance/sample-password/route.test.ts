import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSamplePasswordMaintenance,
  type SamplePasswordMaintenanceDependencies,
} from "./route.ts";

function buildRequest(token = "one-time-token", body: unknown = {
  account: "admin",
  password: "new-password",
}) {
  return new Request("http://localhost/api/internal/maintenance/sample-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-account-maintenance-token": token,
    },
    body: JSON.stringify(body),
  });
}

test("sample password maintenance is hidden when the one-time token is not configured", async () => {
  let repairCalled = false;
  const dependencies: SamplePasswordMaintenanceDependencies = {
    getToken: () => "",
    repair: async () => {
      repairCalled = true;
      return { account: "admin", changed: true };
    },
  };

  const response = await handleSamplePasswordMaintenance(buildRequest(), dependencies);
  assert.equal(response.status, 404);
  assert.equal(repairCalled, false);
});

test("sample password maintenance rejects a mismatched token", async () => {
  const dependencies: SamplePasswordMaintenanceDependencies = {
    getToken: () => "expected-token",
    repair: async () => ({ account: "admin", changed: true }),
  };

  const response = await handleSamplePasswordMaintenance(
    buildRequest("wrong-token"),
    dependencies
  );
  assert.equal(response.status, 401);
});

test("sample password maintenance validates the fixed account allowlist", async () => {
  const dependencies: SamplePasswordMaintenanceDependencies = {
    getToken: () => "one-time-token",
    repair: async () => ({ account: "admin", changed: true }),
  };

  const response = await handleSamplePasswordMaintenance(
    buildRequest("one-time-token", {
      account: "arbitrary-user",
      password: "new-password",
    }),
    dependencies
  );
  assert.equal(response.status, 400);
});

test("sample password maintenance repairs one allowlisted account without echoing the password", async () => {
  let receivedPassword = "";
  const dependencies: SamplePasswordMaintenanceDependencies = {
    getToken: () => "one-time-token",
    repair: async (account, password) => {
      receivedPassword = password;
      return { account, changed: true };
    },
  };

  const response = await handleSamplePasswordMaintenance(buildRequest(), dependencies);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, account: "admin", changed: true });
  assert.equal(receivedPassword, "new-password");
  assert.doesNotMatch(JSON.stringify(body), /new-password/);
});
