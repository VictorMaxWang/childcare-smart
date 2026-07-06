import assert from "node:assert/strict";
import test from "node:test";

import {
  createDemoSeedSnapshot,
  getCurrentDemoContext,
  writeSnapshotToStorage,
} from "@/lib/demo-data/index";

test("D01 snapshot writes degrade when local storage quota is exceeded", () => {
  const now = () => "2026-05-01T08:00:00.000Z";
  const quotaError = Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw quotaError;
    },
    removeItem: () => {},
  };
  const parent = getCurrentDemoContext("parent", { storage, now });
  const snapshot = createDemoSeedSnapshot(now());

  assert.doesNotThrow(() => {
    const persisted = writeSnapshotToStorage(storage, parent.namespace, snapshot);
    assert.equal(persisted, false);
  });
});
