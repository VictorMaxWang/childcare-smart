import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

test("public health endpoint reports deployment readiness without exposing secrets", async () => {
  const previous = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  };
  process.env.AUTH_SESSION_SECRET = "health-auth-secret";
  process.env.BLOB_READ_WRITE_TOKEN = "health-blob-secret";
  process.env.DATABASE_URL = "mysql://health-db-secret";
  process.env.DASHSCOPE_API_KEY = "health-ai-secret";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";

  try {
    const response = GET();
    const body = (await response.json()) as Record<string, unknown>;
    const capabilities = body.capabilities as Record<string, unknown>;
    const deployment = body.deployment as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "ok");
    assert.equal(capabilities.database, true);
    assert.equal(capabilities.auth, true);
    assert.equal(capabilities.privateBlob, true);
    assert.equal(capabilities.dashscope, true);
    assert.equal(deployment.commitSha, "abcdef1234567890");
    assert.equal(response.headers.get("cache-control"), "no-store");

    const serialized = JSON.stringify(body);
    assert.doesNotMatch(
      serialized,
      /health-auth-secret|health-blob-secret|health-db-secret|health-ai-secret/u
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
