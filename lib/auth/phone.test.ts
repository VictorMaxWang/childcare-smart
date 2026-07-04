import assert from "node:assert/strict";
import test from "node:test";

import { normalizePhone } from "@/lib/auth/phone";

test("normalizePhone formats supported mainland China phone inputs as E.164", () => {
  assert.equal(normalizePhone("13800000000"), "+8613800000000");
  assert.equal(normalizePhone("+8613800000000"), "+8613800000000");
  assert.equal(normalizePhone("8613800000000"), "+8613800000000");
  assert.equal(normalizePhone("86 13800000000"), "+8613800000000");
  assert.equal(normalizePhone("86-13800000000"), "+8613800000000");
  assert.equal(normalizePhone("138-0000-0000"), "+8613800000000");
});

test("normalizePhone rejects invalid or non-mainland phone inputs", () => {
  assert.throws(() => normalizePhone("123"), /中国大陆 11 位手机号/);
  assert.throws(() => normalizePhone("23800000000"), /中国大陆 11 位手机号/);
  assert.throws(() => normalizePhone("+12125550123"), /中国大陆 11 位手机号/);
});
