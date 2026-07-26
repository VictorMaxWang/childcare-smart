import assert from "node:assert/strict";
import test from "node:test";

import { getDemoAccountById, type SessionUser } from "../auth/accounts";
import { ApiRouteError } from "../server/api-errors";
import {
  ASSISTANT_CONFIRMATION_TOKEN_TTL_MS,
  InMemoryAssistantConfirmationTokenStore,
  issueAssistantConfirmationToken,
  verifyAndConsumeAssistantConfirmationToken,
} from "./confirmation-token";
import type { AssistantCommand } from "./types";

const TEST_SECRET = "voice-confirmation-test-secret";
const ISSUED_AT = Date.UTC(2026, 6, 26, 8, 0, 0);

function parentSession(): SessionUser {
  const parent = getDemoAccountById("u-parent");
  assert.ok(parent);
  return { ...parent, childIds: ["c-1", "c-4"] };
}

function messageCommand(childId = "c-1"): AssistantCommand {
  return {
    id: "voice-command-message-1",
    intent: "send_message",
    confidence: 0.99,
    role: "parent",
    requiredConfirmation: true,
    params: {
      childId,
      content: "今晚有一点咳嗽，请老师明早帮忙观察。",
    },
    missingParams: [],
    safetyLevel: "write",
    previewText: "向老师发送健康观察留言",
    execute: "send_message",
    status: "needs_confirmation",
  };
}

function issue(
  sessionUser: SessionUser,
  command: AssistantCommand,
  nonce = "11111111-1111-4111-8111-111111111111"
) {
  return issueAssistantConfirmationToken(sessionUser, command, {
    secret: TEST_SECRET,
    now: ISSUED_AT,
    nonce,
  });
}

function confirmed(command: AssistantCommand, confirmationToken: string) {
  return { ...command, confirmationToken };
}

async function assertNeedsConfirmation(
  action: Promise<unknown>,
  messagePattern: RegExp
) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ApiRouteError);
    assert.equal(error.code, "needs_confirmation");
    assert.match(error.message, messagePattern);
    return true;
  });
}

test("a confirmation token is consumed once and cannot be replayed", async () => {
  const sessionUser = parentSession();
  const command = messageCommand();
  const token = issue(sessionUser, command);
  const store = new InMemoryAssistantConfirmationTokenStore();
  const input = confirmed(command, token);

  await verifyAndConsumeAssistantConfirmationToken(sessionUser, input, {
    secret: TEST_SECRET,
    now: ISSUED_AT + 1,
    store,
  });

  await assertNeedsConfirmation(
    verifyAndConsumeAssistantConfirmationToken(sessionUser, input, {
      secret: TEST_SECRET,
      now: ISSUED_AT + 2,
      store,
    }),
    /已使用/
  );
});

test("equivalent token encoding cannot bypass replay protection", async () => {
  const sessionUser = parentSession();
  const command = messageCommand();
  const token = issue(
    sessionUser,
    command,
    "66666666-6666-4666-8666-666666666666"
  );
  const envelope = JSON.parse(
    Buffer.from(token, "base64url").toString("utf8")
  );
  const reencodedToken = Buffer.from(
    JSON.stringify(envelope, null, 2),
    "utf8"
  ).toString("base64url");
  assert.notEqual(reencodedToken, token);

  const store = new InMemoryAssistantConfirmationTokenStore();
  await verifyAndConsumeAssistantConfirmationToken(
    sessionUser,
    confirmed(command, token),
    {
      secret: TEST_SECRET,
      now: ISSUED_AT + 1,
      store,
    }
  );

  await assertNeedsConfirmation(
    verifyAndConsumeAssistantConfirmationToken(
      sessionUser,
      confirmed(command, reencodedToken),
      {
        secret: TEST_SECRET,
        now: ISSUED_AT + 2,
        store,
      }
    ),
    /已使用/
  );
});

test("concurrent confirmation attempts allow exactly one consumer", async () => {
  const sessionUser = parentSession();
  const command = messageCommand();
  const token = issue(
    sessionUser,
    command,
    "22222222-2222-4222-8222-222222222222"
  );
  const store = new InMemoryAssistantConfirmationTokenStore();
  const input = confirmed(command, token);

  const results = await Promise.allSettled([
    verifyAndConsumeAssistantConfirmationToken(sessionUser, input, {
      secret: TEST_SECRET,
      now: ISSUED_AT + 1,
      store,
    }),
    verifyAndConsumeAssistantConfirmationToken(sessionUser, input, {
      secret: TEST_SECRET,
      now: ISSUED_AT + 1,
      store,
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1
  );
});

test("a confirmation token cannot be reused by another user", async () => {
  const sessionUser = parentSession();
  const otherUser = {
    ...sessionUser,
    id: "u-parent-other",
  };
  const command = messageCommand();
  const token = issue(
    sessionUser,
    command,
    "33333333-3333-4333-8333-333333333333"
  );
  const store = new InMemoryAssistantConfirmationTokenStore();

  await assertNeedsConfirmation(
    verifyAndConsumeAssistantConfirmationToken(
      otherUser,
      confirmed(command, token),
      {
        secret: TEST_SECRET,
        now: ISSUED_AT + 1,
        store,
      }
    ),
    /作用域|不匹配/
  );

  await verifyAndConsumeAssistantConfirmationToken(
    sessionUser,
    confirmed(command, token),
    {
      secret: TEST_SECRET,
      now: ISSUED_AT + 2,
      store,
    }
  );
});

test("a confirmation token cannot be rebound to another accessible child", async () => {
  const sessionUser = parentSession();
  const originalCommand = messageCommand("c-1");
  const reboundCommand = messageCommand("c-4");
  const token = issue(
    sessionUser,
    originalCommand,
    "44444444-4444-4444-8444-444444444444"
  );
  const store = new InMemoryAssistantConfirmationTokenStore();

  await assertNeedsConfirmation(
    verifyAndConsumeAssistantConfirmationToken(
      sessionUser,
      confirmed(reboundCommand, token),
      {
        secret: TEST_SECRET,
        now: ISSUED_AT + 1,
        store,
      }
    ),
    /作用域|不匹配/
  );

  await verifyAndConsumeAssistantConfirmationToken(
    sessionUser,
    confirmed(originalCommand, token),
    {
      secret: TEST_SECRET,
      now: ISSUED_AT + 2,
      store,
    }
  );
});

test("an expired confirmation token is rejected without consuming it", async () => {
  const sessionUser = parentSession();
  const command = messageCommand();
  const token = issue(
    sessionUser,
    command,
    "55555555-5555-4555-8555-555555555555"
  );
  const store = new InMemoryAssistantConfirmationTokenStore();

  await assertNeedsConfirmation(
    verifyAndConsumeAssistantConfirmationToken(
      sessionUser,
      confirmed(command, token),
      {
        secret: TEST_SECRET,
        now: ISSUED_AT + ASSISTANT_CONFIRMATION_TOKEN_TTL_MS,
        store,
      }
    ),
    /已过期/
  );

  assert.equal(store.size, 0);
});

test("production refuses confirmation without a durable token store", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousDatabaseUrl = mutableEnv.DATABASE_URL;
  const sessionUser = parentSession();
  const command = messageCommand();
  const token = issue(
    sessionUser,
    command,
    "77777777-7777-4777-8777-777777777777"
  );

  mutableEnv.NODE_ENV = "production";
  delete mutableEnv.DATABASE_URL;
  try {
    await assert.rejects(
      verifyAndConsumeAssistantConfirmationToken(
        sessionUser,
        confirmed(command, token),
        {
          secret: TEST_SECRET,
          now: ISSUED_AT + 1,
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiRouteError);
        assert.equal(error.code, "provider_unavailable");
        assert.equal(error.status, 503);
        return true;
      }
    );
  } finally {
    if (typeof previousNodeEnv === "undefined") {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = previousNodeEnv;
    }
    if (typeof previousDatabaseUrl === "undefined") {
      delete mutableEnv.DATABASE_URL;
    } else {
      mutableEnv.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
