#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createPool } from "mysql2/promise";

import { DatabaseStorybookMediaTaskStore } from "../lib/server/storybook-media-task-store.ts";

const envFile = readArg("env-file") || ".env.local";
loadEnvFile(envFile);

let poolA;
let poolB;
let testScope;

function readArg(name) {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() ?? ""
  );
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  if (!value) return "";
  const quote = value[0];
  if (quote === `"` || quote === "'") {
    const closingQuoteIndex = value.indexOf(quote, 1);
    if (closingQuoteIndex > 0) {
      value = value.slice(1, closingQuoteIndex);
      return quote === `"`
        ? value
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
        : value;
    }
  }
  const commentIndex = value.search(/\s#/u);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const match = normalized.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u
    );
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = parseEnvValue(match[2]);
  }
}

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function databaseConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL missing");
  const url = new URL(connectionString);
  if (!["mysql:", "mysqls:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use mysql:// or mysqls://");
  }
  const database = url.pathname.replace(/^\/+/u, "");
  if (!database) throw new Error("DATABASE_URL missing database name");
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
    waitForConnections: true,
    connectionLimit: 1,
    maxIdle: 1,
    idleTimeout: 10_000,
    connectTimeout: 5_000,
    ssl:
      url.protocol === "mysqls:" || truthy(process.env.DATABASE_SSL)
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

function identity(channel, suffix) {
  return {
    institutionId: testScope.institutionId,
    userId: `smoke-user-${suffix}`,
    childId: testScope.childId,
    storybookId: testScope.storybookId,
    sceneIndex: 1,
    channel,
    provider:
      channel === "image" ? "dashscope-qwen-image" : "vivo-story-tts",
    providerModel:
      channel === "image" ? "qwen-image-plus:1328*1328" : "vivo-tts-smoke",
    inputDigest: createHash("sha256")
      .update(`${testScope.storybookId}:${channel}`, "utf8")
      .digest("hex"),
  };
}

function oneClaim(claims, action, label) {
  const matches = claims
    .map((claim, index) => ({ claim, index }))
    .filter((entry) => entry.claim.action === action);
  assert(matches.length === 1, `${label}: expected exactly one ${action} claim`);
  return matches[0];
}

async function run() {
  const config = databaseConfig();
  poolA = createPool(config);
  poolB = createPool(config);
  const unique = `${Date.now()}-${process.pid}-${randomUUID()}`;
  testScope = {
    institutionId: `storybook-media-smoke-${unique}`,
    childId: `child-${unique}`,
    storybookId: `story-${unique}`,
  };
  const storeA = new DatabaseStorybookMediaTaskStore(poolA);
  const storeB = new DatabaseStorybookMediaTaskStore(poolB);
  const stores = [storeA, storeB];
  const startedAtMs = Date.now();
  const operation = (nowMs) => ({
    nowMs,
    deadlineAtMs: Date.now() + 15_000,
  });

  // 两个独立连接同时抢占，证明提交和轮询租约由 MySQL 原子更新保护。
  const imageIdentity = identity("image", "image");
  const submitClaims = await Promise.all([
    storeA.claim(imageIdentity, operation(startedAtMs)),
    storeB.claim(imageIdentity, operation(startedAtMs)),
  ]);
  const submitWinner = oneClaim(
    submitClaims,
    "submit",
    "image submission lease"
  );
  assert(
    submitClaims.filter((claim) => claim.action === "wait").length === 1,
    "image submission lease: the losing connection must wait"
  );
  const submitClaim = submitWinner.claim;
  assert(submitClaim.leaseToken, "image submission lease token missing");
  const taskId = `task-smoke-${randomUUID()}`;
  assert(
    await stores[submitWinner.index].markAsyncSubmitted(
      imageIdentity,
      submitClaim.leaseToken,
      taskId,
      operation(startedAtMs + 1)
    ),
    "image task submission could not be committed"
  );

  const firstPollClaims = await Promise.all([
    storeA.claim(imageIdentity, operation(startedAtMs + 4_000)),
    storeB.claim(imageIdentity, operation(startedAtMs + 4_000)),
  ]);
  const firstPollWinner = oneClaim(
    firstPollClaims,
    "poll",
    "image poll lease"
  );
  assert(
    firstPollWinner.claim.taskId === taskId,
    "image poll lease changed the provider task id"
  );
  assert(firstPollWinner.claim.leaseToken, "image poll lease token missing");
  assert(
    await stores[firstPollWinner.index].markPollFailure(
      imageIdentity,
      taskId,
      firstPollWinner.claim.leaseToken,
      {
        terminalTask: false,
        retryableSubmission: false,
        nextRetryAtMs: startedAtMs + 7_000,
        reason: "smoke transient poll failure",
      },
      operation(startedAtMs + 4_001)
    ),
    "transient poll failure could not be committed"
  );

  const secondPollClaims = await Promise.all([
    storeA.claim(imageIdentity, operation(startedAtMs + 8_000)),
    storeB.claim(imageIdentity, operation(startedAtMs + 8_000)),
  ]);
  const secondPollWinner = oneClaim(
    secondPollClaims,
    "poll",
    "image retry poll lease"
  );
  assert(
    secondPollWinner.claim.taskId === taskId &&
      secondPollWinner.claim.attemptCount === 1 &&
      secondPollWinner.claim.pollErrorCount === 1,
    "transient polling changed the paid task or attempt counter"
  );
  assert(secondPollWinner.claim.leaseToken, "retry poll lease token missing");
  assert(
    !(await stores[firstPollWinner.index].markPending(
      imageIdentity,
      taskId,
      firstPollWinner.claim.leaseToken,
      operation(startedAtMs + 8_001)
    )),
    "stale poll lease modified the current task"
  );
  assert(
    await stores[secondPollWinner.index].markPending(
      imageIdentity,
      taskId,
      secondPollWinner.claim.leaseToken,
      operation(startedAtMs + 8_002)
    ),
    "current poll lease could not return the task to pending"
  );

  const audioIdentity = identity("audio", "audio");
  const audioClaims = await Promise.all([
    storeA.claim(audioIdentity, operation(startedAtMs + 9_000)),
    storeB.claim(audioIdentity, operation(startedAtMs + 9_000)),
  ]);
  const audioWinner = oneClaim(audioClaims, "submit", "audio submission lease");
  assert(audioWinner.claim.leaseToken, "audio submission lease token missing");
  assert(
    await stores[audioWinner.index].markSubmissionFailure(
      audioIdentity,
      audioWinner.claim.leaseToken,
      {
        retryable: false,
        nextRetryAtMs: startedAtMs + 20_000,
        reason: "smoke terminal audio failure",
      },
      operation(startedAtMs + 9_001)
    ),
    "audio terminal failure could not be committed"
  );
  const blockedAudio = await stores[1 - audioWinner.index].claim(
    audioIdentity,
    operation(startedAtMs + 30_000)
  );
  assert(
    blockedAudio.action === "blocked" && blockedAudio.attemptCount === 1,
    "audio task was retried after its single paid attempt"
  );

  console.log(
    "PASS storybook media MySQL leases, CAS ownership, and paid-attempt limits"
  );
}

async function cleanup() {
  if (poolA && testScope) {
    await poolA
      .execute(
        `
          delete from storybook_media_tasks
          where institution_id = ? and storybook_id = ?
        `,
        [testScope.institutionId, testScope.storybookId]
      )
      .catch(() => undefined);
  }
  await Promise.allSettled([poolA?.end(), poolB?.end()]);
}

run()
  .catch((error) => {
    process.exitCode = 1;
    console.error(
      `FAIL storybook media MySQL smoke: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  })
  .finally(cleanup);
