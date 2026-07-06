import assert from "node:assert/strict";
import test from "node:test";

import { isStorageQuotaExceededError, writeJsonStorageSafely, type JsonStorageLike } from "@/lib/persistence/browser-storage";

class QuotaError extends Error {
  code = 22;
  name = "QuotaExceededError";
}

test("writeJsonStorageSafely returns false instead of throwing when quota stays exceeded", () => {
  const failures: unknown[] = [];
  const storage: JsonStorageLike = {
    setItem() {
      throw new QuotaError("full");
    },
    removeItem() {},
  };

  assert.equal(
    writeJsonStorageSafely(storage, "childcare.normal:user.meals.v3", [{ id: "meal-1" }], {
      onFailure: (failure) => failures.push(failure),
    }),
    false
  );
  assert.equal(failures.length, 1);
  assert.equal((failures[0] as { phase: string; quotaExceeded: boolean }).phase, "retry");
  assert.equal((failures[0] as { phase: string; quotaExceeded: boolean }).quotaExceeded, true);
});

test("writeJsonStorageSafely removes the stale key and retries once on quota errors", () => {
  const calls: string[] = [];
  const storage: JsonStorageLike = {
    setItem() {
      calls.push("set");
      if (calls.length === 1) {
        throw new QuotaError("full");
      }
    },
    removeItem() {
      calls.push("remove");
    },
  };

  assert.equal(writeJsonStorageSafely(storage, "childcare.normal:user.meals.v3", [{ id: "meal-1" }]), true);
  assert.deepEqual(calls, ["set", "remove", "set"]);
});

test("isStorageQuotaExceededError recognizes browser quota variants", () => {
  assert.equal(isStorageQuotaExceededError(new QuotaError("full")), true);
  assert.equal(isStorageQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED", code: 1014 }), true);
  assert.equal(isStorageQuotaExceededError(new Error("other")), false);
});
