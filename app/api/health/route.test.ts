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
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_URL: process.env.VERCEL_URL,
    DEPLOYMENT_COMMIT_SHA: process.env.DEPLOYMENT_COMMIT_SHA,
    DEPLOYMENT_ID: process.env.DEPLOYMENT_ID,
    DEPLOYMENT_URL: process.env.DEPLOYMENT_URL,
  };
  delete process.env.DEPLOYMENT_COMMIT_SHA;
  delete process.env.DEPLOYMENT_ID;
  delete process.env.DEPLOYMENT_URL;
  process.env.AUTH_SESSION_SECRET = "health-auth-secret";
  process.env.BLOB_READ_WRITE_TOKEN = "health-blob-secret";
  process.env.DATABASE_URL = "mysql://health-db-secret";
  process.env.DASHSCOPE_API_KEY = "health-ai-secret";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_health_test";
  process.env.VERCEL_GIT_COMMIT_SHA =
    "abcdef1234567890abcdef1234567890abcdef12";
  process.env.VERCEL_URL = "childcare-health-test.vercel.app";

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
    assert.equal(
      deployment.commitSha,
      "abcdef1234567890abcdef1234567890abcdef12"
    );
    assert.equal(deployment.deploymentId, "dpl_health_test");
    assert.equal(
      deployment.deploymentUrl,
      "https://childcare-health-test.vercel.app"
    );
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

test("self-hosted deployment identity takes precedence and retains secret-free health", async () => {
  const values = {
    DEPLOYMENT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
    DEPLOYMENT_ID: "tencent-release-test",
    DEPLOYMENT_URL: "https://www.smartchildcare.cn/path?ignored=true",
    VERCEL_DEPLOYMENT_ID: "old-vercel-deployment",
    VERCEL_URL: "old.vercel.app",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    const body = await GET().json();
    assert.deepEqual(body.deployment, {
      commitSha: values.DEPLOYMENT_COMMIT_SHA,
      deploymentId: values.DEPLOYMENT_ID,
      deploymentUrl: "https://www.smartchildcare.cn",
    });
    process.env.DEPLOYMENT_URL = "https://[invalid";
    assert.equal((await GET().json()).deployment.deploymentUrl, null);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
