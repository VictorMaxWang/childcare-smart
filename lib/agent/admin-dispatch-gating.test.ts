import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE,
  normalizeAdminNotificationEventsAvailabilityState,
} from "./use-admin-workspace-loader.ts";

test("normalizeAdminNotificationEventsAvailabilityState sanitizes database config failures", () => {
  const state = normalizeAdminNotificationEventsAvailabilityState({
    responseOk: false,
    payload: {
      available: false,
      reasonCode: ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE,
      message: "failed because DATABASE_URL is missing",
      error: "failed because DATABASE_URL is missing",
    },
  });

  assert.equal(state.dispatchAvailable, false);
  assert.equal(state.dispatchStatusMessage, ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE);
  assert.equal(state.dispatchReasonCode, ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE);
});

test("normalizeAdminNotificationEventsAvailabilityState preserves successful availability", () => {
  const state = normalizeAdminNotificationEventsAvailabilityState({
    responseOk: true,
    payload: {
      available: true,
      reasonCode: null,
      message: null,
      error: null,
    },
  });

  assert.equal(state.dispatchAvailable, true);
  assert.equal(state.dispatchStatusMessage, null);
  assert.equal(state.dispatchReasonCode, null);
});
