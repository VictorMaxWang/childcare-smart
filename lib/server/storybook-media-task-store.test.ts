import assert from "node:assert/strict";
import test from "node:test";

import {
  DatabaseStorybookMediaTaskStore,
  InMemoryStorybookMediaTaskStore,
  type StorybookMediaTaskIdentity,
} from "./storybook-media-task-store";

const imageIdentity: StorybookMediaTaskIdentity = {
  institutionId: "inst-1",
  userId: "u-parent",
  childId: "c-1",
  storybookId: "story-1",
  sceneIndex: 1,
  channel: "image",
  provider: "dashscope-qwen-image",
  providerModel: "qwen-image-plus:1328x1328",
  inputDigest:
    "7bb321860cde4c4f4f5e8b84af487350bd5e9dfac6e321d96a5a4fbc9c9e9501",
};

const audioIdentity: StorybookMediaTaskIdentity = {
  ...imageIdentity,
  channel: "audio",
  provider: "vivo-story-tts",
  providerModel: "short_audio_synthesis_jovi:yige_child",
  inputDigest:
    "8cc321860cde4c4f4f5e8b84af487350bd5e9dfac6e321d96a5a4fbc9c9e9502",
};

async function submitImage(
  store: InMemoryStorybookMediaTaskStore,
  nowMs: number,
  taskId = "task-image-12345678"
) {
  const claim = await store.claim(imageIdentity, { nowMs });
  assert.equal(claim.action, "submit");
  assert.ok(claim.leaseToken);
  assert.equal(
    await store.markAsyncSubmitted(
      imageIdentity,
      claim.leaseToken,
      taskId,
      { nowMs: nowMs + 10 }
    ),
    true
  );
  return taskId;
}

test("storybook media task store grants one submission and one poll lease", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const submitClaims = await Promise.all([
    store.claim(imageIdentity, { nowMs: now }),
    store.claim(imageIdentity, { nowMs: now }),
  ]);
  const submit = submitClaims.find((claim) => claim.action === "submit");
  assert.ok(submit?.leaseToken);
  assert.equal(
    submitClaims.filter((claim) => claim.action === "submit").length,
    1
  );
  assert.equal(
    await store.markAsyncSubmitted(
      imageIdentity,
      submit.leaseToken,
      "task-image-12345678",
      { nowMs: now + 10 }
    ),
    true
  );

  const pollClaims = await Promise.all([
    store.claim(imageIdentity, { nowMs: now + 3_011 }),
    store.claim(imageIdentity, { nowMs: now + 3_011 }),
  ]);
  const poll = pollClaims.find((claim) => claim.action === "poll");
  assert.ok(poll?.leaseToken);
  assert.equal(
    pollClaims.filter((claim) => claim.action === "poll").length,
    1
  );
  assert.equal(
    await store.markPending(
      imageIdentity,
      "task-image-12345678",
      "wrong-poll-lease",
      { nowMs: now + 3_020 }
    ),
    false
  );
  assert.equal(
    await store.markPending(
      imageIdentity,
      "task-image-12345678",
      poll.leaseToken,
      { nowMs: now + 3_020 }
    ),
    true
  );
});

test("unknown submission outcomes are blocked and cannot clear another lease", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const claim = await store.claim(imageIdentity, { nowMs: now });
  assert.ok(claim.leaseToken);

  assert.equal(
    await store.markSubmissionFailure(
      imageIdentity,
      "wrong-submission-lease",
      {
        retryable: false,
        nextRetryAtMs: now + 1_000,
        reason: "network outcome unknown",
      }
    ),
    false
  );
  assert.equal(
    await store.markSubmissionFailure(
      imageIdentity,
      claim.leaseToken,
      {
        retryable: false,
        nextRetryAtMs: now + 1_000,
        reason: "network outcome unknown",
      }
    ),
    true
  );
  const replay = await store.claim(imageIdentity, { nowMs: now + 60_001 });
  assert.equal(replay.action, "blocked");
  assert.equal(replay.attemptCount, 1);
});

test("retryable image submissions stop after the second paid attempt", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const first = await store.claim(imageIdentity, { nowMs: now });
  assert.ok(first.leaseToken);
  assert.equal(
    await store.markSubmissionFailure(
      imageIdentity,
      first.leaseToken,
      {
        retryable: true,
        nextRetryAtMs: now + 1_000,
        reason: "explicit provider throttling",
      }
    ),
    true
  );
  const second = await store.claim(imageIdentity, { nowMs: now + 1_001 });
  assert.equal(second.action, "submit");
  assert.equal(second.attemptCount, 2);
  assert.ok(second.leaseToken);
  assert.equal(
    await store.markSubmissionFailure(
      imageIdentity,
      second.leaseToken,
      {
        retryable: true,
        nextRetryAtMs: now + 2_000,
        reason: "explicit provider throttling",
      }
    ),
    true
  );

  const exhausted = await store.claim(imageIdentity, {
    nowMs: now + 10_000,
  });
  assert.equal(exhausted.action, "blocked");
  assert.equal(exhausted.attemptCount, 2);
});

test("transient poll failures keep the same provider task beyond three errors", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const taskId = await submitImage(store, now);
  let cursor = now + 3_011;

  for (let failure = 1; failure <= 5; failure += 1) {
    const poll = await store.claim(imageIdentity, { nowMs: cursor });
    assert.equal(poll.action, "poll");
    assert.ok(poll.leaseToken);
    assert.equal(
      await store.markPollFailure(
        imageIdentity,
        taskId,
        poll.leaseToken,
        {
          terminalTask: false,
          retryableSubmission: false,
          nextRetryAtMs: cursor + 1_000,
          reason: "temporary poll failure",
        },
        { nowMs: cursor }
      ),
      true
    );
    cursor += 1_001;
  }

  const retry = await store.claim(imageIdentity, { nowMs: cursor });
  assert.equal(retry.action, "poll");
  assert.equal(retry.taskId, taskId);
  assert.equal(retry.attemptCount, 1);
  assert.equal(retry.pollErrorCount, 5);
});

test("terminal image tasks may resubmit once and then become blocked", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const firstTask = await submitImage(store, now, "task-image-11111111");
  const firstPoll = await store.claim(imageIdentity, {
    nowMs: now + 3_011,
  });
  assert.equal(firstPoll.action, "poll");
  assert.ok(firstPoll.leaseToken);
  assert.equal(
    await store.markPollFailure(
      imageIdentity,
      firstTask,
      firstPoll.leaseToken,
      {
        terminalTask: true,
        retryableSubmission: true,
        nextRetryAtMs: now + 4_000,
        reason: "provider task expired",
      }
    ),
    true
  );
  const secondSubmit = await store.claim(imageIdentity, {
    nowMs: now + 4_001,
  });
  assert.equal(secondSubmit.action, "submit");
  assert.equal(secondSubmit.attemptCount, 2);
  assert.ok(secondSubmit.leaseToken);
  assert.equal(
    await store.markAsyncSubmitted(
      imageIdentity,
      secondSubmit.leaseToken,
      "task-image-22222222",
      { nowMs: now + 4_010 }
    ),
    true
  );
  const secondPoll = await store.claim(imageIdentity, {
    nowMs: now + 7_011,
  });
  assert.equal(secondPoll.action, "poll");
  assert.ok(secondPoll.leaseToken);
  assert.equal(
    await store.markPollFailure(
      imageIdentity,
      "task-image-22222222",
      secondPoll.leaseToken,
      {
        terminalTask: true,
        retryableSubmission: true,
        nextRetryAtMs: now + 8_000,
        reason: "provider task expired again",
      }
    ),
    true
  );

  const blocked = await store.claim(imageIdentity, {
    nowMs: now + 20_000,
  });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.attemptCount, 2);
});

test("audio and image use independent task identities and audio never auto-retries", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const [imageClaim, audioClaim] = await Promise.all([
    store.claim(imageIdentity, { nowMs: now }),
    store.claim(audioIdentity, { nowMs: now }),
  ]);
  assert.equal(imageClaim.action, "submit");
  assert.equal(audioClaim.action, "submit");
  assert.ok(audioClaim.leaseToken);
  assert.equal(
    await store.markSubmissionFailure(
      audioIdentity,
      audioClaim.leaseToken,
      {
        retryable: true,
        nextRetryAtMs: now + 1_000,
        reason: "audio persistence failed",
      }
    ),
    true
  );
  const audioReplay = await store.claim(audioIdentity, {
    nowMs: now + 10_000,
  });
  assert.equal(audioReplay.action, "blocked");
  assert.equal(audioReplay.attemptCount, 1);
});

test("an active audio submission lease is reported as waiting instead of exhausted", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const first = await store.claim(audioIdentity, { nowMs: now });
  assert.equal(first.action, "submit");

  const concurrent = await store.claim(audioIdentity, {
    nowMs: now + 1_000,
  });
  assert.equal(concurrent.action, "wait");
  assert.equal(concurrent.attemptCount, 1);
  assert.equal(concurrent.taskId, null);
});

test("a blocked poll keeps the provider task id and never opens another paid submission", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const taskId = await submitImage(store, now);
  const poll = await store.claim(imageIdentity, {
    nowMs: now + 3_011,
  });
  assert.equal(poll.action, "poll");
  assert.ok(poll.leaseToken);
  assert.equal(
    await store.markPollFailure(
      imageIdentity,
      taskId,
      poll.leaseToken,
      {
        terminalTask: false,
        retryableSubmission: false,
        blockTask: true,
        nextRetryAtMs: now + 4_000,
        reason: "provider task reached its retention boundary",
      }
    ),
    true
  );

  const blocked = await store.claim(imageIdentity, {
    nowMs: now + 60_000,
  });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.taskId, taskId);
  assert.equal(blocked.attemptCount, 1);
});

test("database task claims use the query protocol for transaction control", async () => {
  const transactionQueries: string[] = [];
  const executedSql: string[] = [];
  const fakeConnection = {
    execute: async (statement: string | { sql: string }) => {
      const sql =
        typeof statement === "string" ? statement : statement.sql;
      const normalized = sql.trim().replace(/\s+/gu, " ").toLowerCase();
      executedSql.push(normalized);
      assert.doesNotMatch(
        normalized,
        /^(?:start transaction|commit|rollback)$/u
      );
      if (normalized.startsWith("select status")) {
        return [
          [
            {
              status: "submitting",
              lease_token: "lease-from-database",
              lease_expires_at: new Date(Date.now() + 10_000),
              task_id: null,
              submitted_at: null,
              attempt_count: 1,
              poll_error_count: 0,
              next_retry_at: null,
              media_key: null,
              last_error_reason: null,
            },
          ],
          [],
        ];
      }
      if (
        normalized.startsWith("update storybook_media_tasks") &&
        normalized.includes("status = 'polling'")
      ) {
        return [{ affectedRows: 0 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
    query: async (statement: string | { sql: string }) => {
      const sql =
        typeof statement === "string" ? statement : statement.sql;
      transactionQueries.push(
        sql.trim().replace(/\s+/gu, " ").toLowerCase()
      );
      return [{ affectedRows: 0 }, []];
    },
    release: () => undefined,
    destroy: () => undefined,
  };
  const fakePool = {
    getConnection: async () => fakeConnection,
  };
  const store = new DatabaseStorybookMediaTaskStore(
    fakePool as never
  );

  const claim = await store.claim(imageIdentity, {
    nowMs: Date.now(),
  });

  assert.equal(claim.action, "submit");
  assert.deepEqual(transactionQueries, [
    "start transaction",
    "commit",
  ]);
  assert.ok(
    executedSql.some((sql) =>
      sql.startsWith("update storybook_media_tasks")
    )
  );
});

test("ready media invalidation reuses image task but blocks unrecoverable audio", async () => {
  const store = new InMemoryStorybookMediaTaskStore();
  const now = Date.now();
  const taskId = await submitImage(store, now);
  const imagePoll = await store.claim(imageIdentity, {
    nowMs: now + 3_011,
  });
  assert.equal(imagePoll.action, "poll");
  assert.ok(imagePoll.leaseToken);
  const imageMediaKey =
    "0123456789abcdef0123456789abcdef01234567";
  assert.equal(
    await store.markReady(
      imageIdentity,
      {
        leaseToken: imagePoll.leaseToken,
        taskId,
        mediaKey: imageMediaKey,
      }
    ),
    true
  );
  assert.equal(
    await store.invalidateReadyMedia(
      imageIdentity,
      imageMediaKey,
      "persistent image is missing",
      { nowMs: now + 3_020 }
    ),
    true
  );
  const imageRetry = await store.claim(imageIdentity, {
    nowMs: now + 3_021,
  });
  assert.equal(imageRetry.action, "poll");
  assert.equal(imageRetry.taskId, taskId);

  const audioSubmit = await store.claim(audioIdentity, { nowMs: now });
  assert.equal(audioSubmit.action, "submit");
  assert.ok(audioSubmit.leaseToken);
  const audioMediaKey =
    "fedcba9876543210fedcba9876543210fedcba98";
  assert.equal(
    await store.markReady(audioIdentity, {
      leaseToken: audioSubmit.leaseToken,
      mediaKey: audioMediaKey,
    }),
    true
  );
  assert.equal(
    await store.invalidateReadyMedia(
      audioIdentity,
      audioMediaKey,
      "persistent audio is missing"
    ),
    true
  );
  const audioBlocked = await store.claim(audioIdentity, {
    nowMs: now + 10_000,
  });
  assert.equal(audioBlocked.action, "blocked");
});
