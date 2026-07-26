import assert from "node:assert/strict";
import test from "node:test";
import { formatClockTime } from "./date.ts";

test("formatClockTime preserves valid time-only attendance values", () => {
  assert.equal(formatClockTime("08:05"), "08:05");
  assert.equal(formatClockTime("8:05:42"), "08:05");
  assert.equal(formatClockTime(" 17:30 "), "17:30");
});

test("formatClockTime rejects invalid or missing attendance values", () => {
  assert.equal(formatClockTime("25:10", "已入园"), "已入园");
  assert.equal(formatClockTime("not-a-time", "已入园"), "已入园");
  assert.equal(formatClockTime(undefined, "暂无"), "暂无");
});

test("formatClockTime accepts complete timestamps", () => {
  const value = formatClockTime("2026-07-26T08:05:00+08:00");
  assert.match(value, /^\d{2}:\d{2}$/);
  assert.notEqual(value, "Invalid Date");
});
