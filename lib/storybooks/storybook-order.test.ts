import assert from "node:assert/strict";
import test from "node:test";

import {
  compareStorybooksByLatestSave,
  resolveStorybookActivityAt,
} from "./storybook-order.ts";

test("storybook activity uses save time before provider generation time", () => {
  const oldProviderResultSavedNow = {
    generatedAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2026-07-28T03:00:00.000Z",
  };
  const futureProviderResultSavedEarlier = {
    generatedAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-07-28T02:00:00.000Z",
  };

  assert.equal(
    resolveStorybookActivityAt(oldProviderResultSavedNow),
    oldProviderResultSavedNow.updatedAt
  );
  assert.deepEqual(
    [futureProviderResultSavedEarlier, oldProviderResultSavedNow].sort(
      compareStorybooksByLatestSave
    ),
    [oldProviderResultSavedNow, futureProviderResultSavedEarlier]
  );
});

test("storybook activity falls back to generatedAt for legacy records", () => {
  const legacy = { generatedAt: "2026-07-27T10:00:00.000Z" };
  assert.equal(resolveStorybookActivityAt(legacy), legacy.generatedAt);
});
