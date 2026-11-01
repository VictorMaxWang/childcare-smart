import assert from "node:assert/strict";
import test from "node:test";
import { childOnboardingDraftKey, childOnboardingErrorState, parseChildOnboardingDraft, prepareChildOnboardingDraft } from "./child-onboarding-draft";
import { ApiClientError } from "@/lib/api/errors";

const payload = { name: "合成儿童", nickname: "", birthDate: "2025-03-01", gender: "男" as const, consentAccepted: true };
test("lost onboarding response can replay the original request after tab refresh", () => {
  const first = prepareChildOnboardingDraft(payload, null, () => "onboarding-first-request");
  const restored = parseChildOnboardingDraft(JSON.stringify(first));
  const replay = prepareChildOnboardingDraft(payload, restored, () => "must-not-use-new-request");
  assert.equal(replay.requestId, first.requestId);
  assert.equal(prepareChildOnboardingDraft({ ...payload, gender: "女" }, restored, () => "changed-input-request-id").requestId, "changed-input-request-id");
  assert.equal("consents" in replay.form, false, "恢复草稿不能代替监护人重新确认三项同意");
});
test("onboarding drafts are scoped to user and institution, with delimiter-safe keys", () => {
  assert.notEqual(childOnboardingDraftKey("parent-a", "inst-a"), childOnboardingDraftKey("parent-b", "inst-a"));
  assert.notEqual(childOnboardingDraftKey("parent-a", "inst-a"), childOnboardingDraftKey("parent-a", "inst-b"));
  assert.notEqual(childOnboardingDraftKey("a:b", "c"), childOnboardingDraftKey("b", "c:a"));
});
test("malformed or oversized onboarding drafts are not restored", () => {
  for (const value of [null, "{}", "null", "not-json", "x".repeat(4001), JSON.stringify({ ...prepareChildOnboardingDraft(payload, null, () => "valid-request-identity"), requestId: "bad!" })]) assert.equal(parseChildOnboardingDraft(value), null);
});
test("lost POST response explains an unknown result in Chinese and keeps the replay intent", () => {
  for (const error of [new TypeError("Failed to fetch"), new DOMException("timeout", "TimeoutError"), new ApiClientError("server disconnected", "server_error", 500)]) {
    const result = childOnboardingErrorState(error);
    assert.equal(result.resultUnknown, true); assert.match(result.message, /相同资料重试.*原档案/u);
    assert.doesNotMatch(`${result.title}${result.message}`, /创建失败|Failed to fetch|server disconnected/u);
  }
  const definite = childOnboardingErrorState(new ApiClientError("请选择孩子性别。", "invalid_request", 400));
  assert.equal(definite.resultUnknown, false); assert.equal(definite.message, "请选择孩子性别。");
});
