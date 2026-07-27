import assert from "node:assert/strict";
import test from "node:test";

import {
  DatabaseVivoAsrTaskStore,
  MemoryVivoAsrTaskStore,
  type VivoAsrTaskIdentity,
} from "./vivo-asr-task-store";

const DAY_MS = 24 * 60 * 60 * 1_000;
const AFTER_LEASE_MS = 2 * 60 * 1_000;

const identity: VivoAsrTaskIdentity = {
  institutionId: "inst-1",
  userId: "teacher-1",
  providerModel: "vivo-asr:16k:zh-CN",
  audioDigest:
    "7bb321860cde4c4f4f5e8b84af487350bd5e9dfac6e321d96a5a4fbc9c9e9501",
  mimeType: "audio/webm",
};

async function startRunning(
  store: MemoryVivoAsrTaskStore,
  nowMs: number,
  taskIdentity = identity,
  taskId = "vivo-task-12345678"
) {
  const submission = await store.claim(taskIdentity, { nowMs });
  assert.equal(submission.action, "submit");
  assert.ok(submission.leaseToken);
  assert.ok(submission.requestId);
  assert.ok(submission.sessionId);
  assert.equal(
    await store.markRunDispatching(
      taskIdentity,
      submission.leaseToken,
      { nowMs: nowMs + 1 }
    ),
    true
  );
  assert.equal(
    await store.markRunning(
      taskIdentity,
      submission.leaseToken,
      taskId,
      { nowMs: nowMs + 2 }
    ),
    true
  );
  return { submission, taskId };
}

test("concurrent claims grant exactly one submission lease", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();

  const claims = await Promise.all([
    store.claim(identity, { nowMs }),
    store.claim(identity, { nowMs }),
  ]);

  const submission = claims.find((claim) => claim.action === "submit");
  const waiter = claims.find((claim) => claim.action === "wait");
  assert.ok(submission?.leaseToken);
  assert.ok(submission.requestId);
  assert.ok(submission.sessionId);
  assert.equal(
    claims.filter((claim) => claim.action === "submit").length,
    1
  );
  assert.equal(waiter?.leaseToken, null);
  assert.equal(waiter?.requestId, submission.requestId);
  assert.equal(waiter?.sessionId, submission.sessionId);
});

test("task identity key includes every tenant, actor, model, audio, and MIME dimension", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  assert.equal(
    (await store.claim(identity, { nowMs })).action,
    "submit"
  );

  const variants: VivoAsrTaskIdentity[] = [
    { ...identity, institutionId: "inst-2" },
    { ...identity, userId: "teacher-2" },
    { ...identity, providerModel: "vivo-asr:8k:zh-CN" },
    {
      ...identity,
      audioDigest:
        "8cc321860cde4c4f4f5e8b84af487350bd5e9dfac6e321d96a5a4fbc9c9e9502",
    },
    { ...identity, mimeType: "audio/wav" },
  ];
  for (const variant of variants) {
    assert.equal(
      (await store.claim(variant, { nowMs })).action,
      "submit"
    );
  }
});

test("submitting retries only after lease expiry and stops after two attempts", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const first = await store.claim(identity, { nowMs });
  assert.equal(first.action, "submit");

  const beforeExpiry = await store.claim(identity, {
    nowMs: nowMs + 1_000,
  });
  assert.equal(beforeExpiry.action, "wait");

  const second = await store.claim(identity, {
    nowMs: nowMs + AFTER_LEASE_MS,
  });
  assert.equal(second.action, "submit");
  assert.notEqual(second.leaseToken, first.leaseToken);
  assert.notEqual(second.requestId, first.requestId);
  assert.notEqual(second.sessionId, first.sessionId);

  const exhausted = await store.claim(identity, {
    nowMs: nowMs + 2 * AFTER_LEASE_MS,
  });
  assert.equal(exhausted.action, "blocked");
  assert.equal(exhausted.leaseToken, null);
  assert.match(
    exhausted.lastErrorReason ?? "",
    /retry budget|重试预算/iu
  );
});

test("retryable and blocked transitions require the active submission lease", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const first = await store.claim(identity, { nowMs });
  assert.ok(first.leaseToken);
  assert.equal(
    await store.markRetryable(
      identity,
      "11111111-1111-4111-8111-111111111111",
      "create failed before /run",
      { nowMs: nowMs + 1 }
    ),
    false
  );
  assert.equal(
    await store.markRetryable(
      identity,
      first.leaseToken,
      "create failed before /run",
      { nowMs: nowMs + 1 }
    ),
    true
  );

  const second = await store.claim(identity, { nowMs: nowMs + 2 });
  assert.equal(second.action, "submit");
  assert.ok(second.leaseToken);
  assert.equal(
    await store.markBlocked(
      identity,
      second.leaseToken,
      "provider rejected the task",
      { nowMs: nowMs + 3 }
    ),
    true
  );
  const blocked = await store.claim(identity, { nowMs: nowMs + 4 });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.lastErrorReason, "provider rejected the task");
});

test("run-dispatching never opens another provider submission", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const submission = await store.claim(identity, { nowMs });
  assert.ok(submission.leaseToken);
  assert.equal(
    await store.markRunDispatching(
      identity,
      submission.leaseToken,
      { nowMs: nowMs + 1 }
    ),
    true
  );

  const concurrent = await store.claim(identity, {
    nowMs: nowMs + 1_000,
  });
  assert.equal(concurrent.action, "wait");

  const uncertain = await store.claim(identity, {
    nowMs: nowMs + AFTER_LEASE_MS,
  });
  assert.equal(uncertain.action, "blocked");
  assert.equal(uncertain.requestId, submission.requestId);
  assert.equal(uncertain.sessionId, submission.sessionId);
  assert.equal(uncertain.taskId, null);
  assert.match(
    uncertain.lastErrorReason ?? "",
    /outcome is uncertain|结果未知/iu
  );
});

test("running task resumes after lease expiry and markPending clears the lease", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const { taskId } = await startRunning(store, nowMs);

  const concurrent = await store.claim(identity, {
    nowMs: nowMs + 1_000,
  });
  assert.equal(concurrent.action, "wait");
  assert.equal(concurrent.taskId, taskId);

  const resumed = await store.claim(identity, {
    nowMs: nowMs + AFTER_LEASE_MS,
  });
  assert.equal(resumed.action, "resume");
  assert.ok(resumed.leaseToken);
  assert.equal(resumed.taskId, taskId);

  assert.equal(
    await store.markPending(
      identity,
      resumed.leaseToken,
      taskId,
      "provider is still processing",
      { nowMs: nowMs + AFTER_LEASE_MS + 1 }
    ),
    true
  );
  const resumedAgain = await store.claim(identity, {
    nowMs: nowMs + AFTER_LEASE_MS + 2,
  });
  assert.equal(resumedAgain.action, "resume");
  assert.equal(resumedAgain.taskId, taskId);
});

test("markPending persists a returned task id directly from run-dispatching", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const submission = await store.claim(identity, { nowMs });
  assert.ok(submission.leaseToken);
  assert.equal(
    await store.markRunDispatching(
      identity,
      submission.leaseToken,
      { nowMs: nowMs + 1 }
    ),
    true
  );

  assert.equal(
    await store.markPending(
      identity,
      submission.leaseToken,
      "vivo-task-late-12345678",
      "polling deadline exhausted after /run returned",
      { nowMs: nowMs + 2 }
    ),
    true
  );
  const resumed = await store.claim(identity, { nowMs: nowMs + 3 });
  assert.equal(resumed.action, "resume");
  assert.equal(resumed.taskId, "vivo-task-late-12345678");
});

test("ready result replays and may be committed directly from run-dispatching", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const submission = await store.claim(identity, { nowMs });
  assert.ok(submission.leaseToken);
  assert.equal(
    await store.markRunDispatching(
      identity,
      submission.leaseToken,
      { nowMs: nowMs + 1 }
    ),
    true
  );
  const resultJson = {
    transcript: "小雨今天午餐吃完了。",
    confidence: 0.97,
  };
  assert.equal(
    await store.markReady(
      identity,
      submission.leaseToken,
      "vivo-task-ready-12345678",
      resultJson,
      { nowMs: nowMs + 2 }
    ),
    true
  );

  const replay = await store.claim(identity, { nowMs: nowMs + 3 });
  assert.equal(replay.action, "ready");
  assert.equal(replay.leaseToken, null);
  assert.equal(replay.taskId, "vivo-task-ready-12345678");
  assert.deepEqual(replay.resultJson, resultJson);
});

test("ready result also commits from running", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const { submission, taskId } = await startRunning(store, nowMs);
  assert.ok(submission.leaseToken);
  const resultJson = { transcript: "体温三十六点六度。" };

  assert.equal(
    await store.markReady(
      identity,
      submission.leaseToken,
      taskId,
      resultJson,
      { nowMs: nowMs + 3 }
    ),
    true
  );
  const replay = await store.claim(identity, { nowMs: nowMs + 4 });
  assert.equal(replay.action, "ready");
  assert.deepEqual(replay.resultJson, resultJson);
});

test("expired ready rows are rebuilt with a fresh submission identity", async () => {
  const store = new MemoryVivoAsrTaskStore();
  const nowMs = Date.now();
  const { submission, taskId } = await startRunning(store, nowMs);
  assert.ok(submission.leaseToken);
  assert.equal(
    await store.markReady(
      identity,
      submission.leaseToken,
      taskId,
      { transcript: "旧结果" },
      { nowMs: nowMs + 3 }
    ),
    true
  );

  const rebuilt = await store.claim(identity, {
    nowMs: nowMs + DAY_MS + 4,
  });
  assert.equal(rebuilt.action, "submit");
  assert.notEqual(rebuilt.requestId, submission.requestId);
  assert.notEqual(rebuilt.sessionId, submission.sessionId);
  assert.equal(rebuilt.taskId, null);
  assert.equal(rebuilt.resultJson, null);
});

test("database connection acquisition obeys the operation deadline", async () => {
  const never = new Promise<never>(() => undefined);
  const store = new DatabaseVivoAsrTaskStore({
    getConnection: () => never,
  } as never);
  const startedAt = Date.now();

  await assert.rejects(
    store.claim(identity, {
      deadlineAtMs: Date.now() + 25,
    }),
    /deadline exhausted/iu
  );
  assert.ok(Date.now() - startedAt < 1_000);
});

test("database markRunning recognizes an unknown commit by task-id readback", async () => {
  const leaseToken = "11111111-1111-4111-8111-111111111111";
  const taskId = "vivo-task-readback-12345678";
  const fakeConnection = {
    execute: async (statement: string | { sql: string }) => {
      const sql =
        typeof statement === "string" ? statement : statement.sql;
      const normalized = sql.trim().replace(/\s+/gu, " ").toLowerCase();
      if (normalized.startsWith("create table")) {
        return [{ affectedRows: 0 }, []];
      }
      if (normalized.startsWith("update vivo_asr_tasks")) {
        throw new Error("connection closed after server commit");
      }
      if (normalized.startsWith("select status")) {
        return [
          [
            {
              status: "running",
              lease_token: leaseToken,
              lease_expires_at: new Date(Date.now() + 60_000),
              request_id: "22222222-2222-4222-8222-222222222222",
              session_id: "33333333-3333-4333-8333-333333333333",
              task_id: taskId,
              attempt_count: 1,
              result_json: null,
              last_error_reason: null,
              expires_at: new Date(Date.now() + DAY_MS),
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    release: () => undefined,
    destroy: () => undefined,
  };
  const store = new DatabaseVivoAsrTaskStore({
    getConnection: async () => fakeConnection,
  } as never);

  assert.equal(
    await store.markRunning(identity, leaseToken, taskId),
    true
  );
});

test("database claim deletes at most 100 expired rows within its budget", async () => {
  let cleanupSql = "";
  let submissionValues: unknown[] = [];
  const fakeConnection = {
    execute: async (
      statement: string | { sql: string },
      values: unknown[] = []
    ) => {
      const sql =
        typeof statement === "string" ? statement : statement.sql;
      const normalized = sql.trim().replace(/\s+/gu, " ").toLowerCase();
      if (normalized.startsWith("delete from vivo_asr_tasks")) {
        cleanupSql = normalized;
        return [{ affectedRows: 100 }, []];
      }
      if (
        normalized.startsWith("update vivo_asr_tasks") &&
        normalized.includes("status = 'submitting'")
      ) {
        submissionValues = values;
        return [{ affectedRows: 1 }, []];
      }
      if (normalized.startsWith("select status")) {
        return [
          [
            {
              status: "submitting",
              lease_token: submissionValues[2],
              lease_expires_at: submissionValues[3],
              request_id: submissionValues[0],
              session_id: submissionValues[1],
              task_id: null,
              attempt_count: 1,
              result_json: null,
              last_error_reason: null,
              expires_at: submissionValues[4],
            },
          ],
          [],
        ];
      }
      return [{ affectedRows: 0 }, []];
    },
    release: () => undefined,
    destroy: () => undefined,
  };
  const store = new DatabaseVivoAsrTaskStore({
    getConnection: async () => fakeConnection,
  } as never);

  const claim = await store.claim(identity, {
    deadlineAtMs: Date.now() + 1_000,
  });
  assert.equal(claim.action, "submit");
  assert.match(
    cleanupSql,
    /where expires_at <= \? order by expires_at limit 100$/u
  );
});
