import assert from "node:assert/strict";
import test from "node:test";

import { buildApiFailure } from "@/lib/api/errors";
import { apiError, apiOk, ApiRouteError, handleApiError } from "@/lib/server/api-errors";

test("apiError returns the uniform failure envelope and status", async () => {
  const response = apiError("forbidden_scope", "scope denied");
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    ok: false,
    code: "forbidden_scope",
    error: "scope denied",
  });
});

test("apiOk returns the uniform success envelope", async () => {
  const response = apiOk({ value: 1 }, { status: 201 });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, {
    ok: true,
    data: { value: 1 },
  });
});

test("handleApiError preserves ApiRouteError code and status", async () => {
  const response = handleApiError(new ApiRouteError("unauthorized", "missing session"));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    ok: false,
    code: "unauthorized",
    error: "missing session",
  });
});

test("buildApiFailure never emits success fields", () => {
  assert.deepEqual(buildApiFailure("invalid_request", "bad input"), {
    ok: false,
    code: "invalid_request",
    error: "bad input",
  });
});
