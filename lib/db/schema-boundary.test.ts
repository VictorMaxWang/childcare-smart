import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isMissingDatabaseTableError } from "./server.ts";

test("request-time database modules never execute schema DDL", async () => {
  const [storybookSource, notificationSource] = await Promise.all([
    readFile(new URL("./storybook-media.ts", import.meta.url), "utf8"),
    readFile(new URL("./notification-events.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(storybookSource, /\bcreate\s+table\b/iu);
  assert.doesNotMatch(notificationSource, /\bcreate\s+table\b/iu);
});

test("schema readiness recognizes MySQL missing-table errors without matching unrelated failures", () => {
  assert.equal(isMissingDatabaseTableError({ code: "ER_NO_SUCH_TABLE" }), true);
  assert.equal(isMissingDatabaseTableError({ errno: 1146 }), true);
  assert.equal(isMissingDatabaseTableError({ code: "ER_ACCESS_DENIED_ERROR", errno: 1045 }), false);
  assert.equal(isMissingDatabaseTableError(new Error("missing table")), false);
});
