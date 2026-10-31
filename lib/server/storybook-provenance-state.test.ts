import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import { attestAiResult, verifyAiResultAttestation } from "@/lib/ai/provenance-attestation";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { assertSafePersistedStorybookUpdate, resolveAuthorizedStoredStorybookContinuation } from "./storybook-provenance-state";

const parent = { ...DEMO_ACCOUNTS.find(account => account.id === "u-parent")!, accountKind: "normal" } satisfies SessionUser;
const context = { userId: "teacher-a", institutionId: parent.institutionId, scopeId: "c-1", capability: "parent-storybook" };
function fixture() {
  const canonical = attestAiResult({
    storyId: "paid-book", childId: "c-1", title: "真实绘本", source: "ai", fallback: false,
    providerMeta: { provider: "maas", textProvider: "maas", realProvider: true },
    scenes: [{ sceneIndex: 1, sceneText: "一起捧小杯。", audioScript: "一起捧小杯。", imageStatus: "ready", audioStatus: "ready", imageUrl: "/private/image", audioUrl: "/private/audio", imageProvider: "maas-z-image", audioProvider: "maas-tts" }],
  }, context);
  const snapshot = normalizeExtendedSnapshot(createDemoSeedSnapshot(), parent);
  const stored = { storybookId: canonical.storyId, childId: canonical.childId, sourceRecordIds: [], generatedAt: "2026-10-31T00:00:00.000Z", pages: [{ kind: "parent-storybook-response", response: canonical }] };
  snapshot.storybooks = [stored];
  return { canonical, snapshot, stored };
}

test("authorized parent continuation rebinds only the persisted teacher canonical and does not mutate it", () => {
  const { canonical, snapshot } = fixture();
  const before = JSON.stringify(snapshot);
  assert.equal(verifyAiResultAttestation(canonical, { ...context, userId: parent.id }), false);
  const continued = resolveAuthorizedStoredStorybookContinuation({ user: parent, snapshot, storyId: canonical.storyId, childId: canonical.childId });
  assert.ok(continued);
  assert.equal(verifyAiResultAttestation(continued, { ...context, userId: parent.id }), true);
  assert.deepEqual(continued.scenes, canonical.scenes);
  assert.equal(JSON.stringify(snapshot), before, "只读接续不得回写或清除原媒体");
});

test("a forged stored body, wrong institution, or mismatched story identity cannot be reattested", () => {
  for (const tamper of ["content", "institution", "identity"] as const) {
    const { canonical, snapshot } = fixture();
    if (tamper === "content") canonical.scenes[0].sceneText = "伪造经历";
    if (tamper === "institution") snapshot.storybooks[0].pages[0].response = attestAiResult({ ...canonical }, { ...context, institutionId: "other-institution" });
    if (tamper === "identity") snapshot.storybooks[0].storybookId = "different-book";
    assert.equal(resolveAuthorizedStoredStorybookContinuation({ user: parent, snapshot, storyId: canonical.storyId, childId: "c-1" }), null, tamper);
  }
});

test("cross-role resume preserves pending and unknown task state without inventing paid results", () => {
  const { canonical, snapshot } = fixture();
  const pending = attestAiResult({ ...canonical,
    providerMeta: { ...canonical.providerMeta, diagnostics: {
      image: { jobStatus: "warming", pendingSceneCount: 1 },
      audio: { jobStatus: "error", pendingSceneCount: 1, lastErrorReason: "media-result-unknown" },
    } },
    scenes: [{ ...canonical.scenes[0], imageStatus: "pending", imageUrl: null, audioStatus: "empty", audioUrl: null }],
  }, context);
  snapshot.storybooks[0].pages[0].response = pending;
  const continued = resolveAuthorizedStoredStorybookContinuation({ user: parent, snapshot, storyId: canonical.storyId, childId: "c-1" });
  assert.ok(continued);
  assert.equal(verifyAiResultAttestation(continued, { ...context, userId: parent.id }), true);
  assert.deepEqual(continued.providerMeta, pending.providerMeta);
  assert.deepEqual(continued.scenes, pending.scenes);
  assert.equal(continued.scenes[0].audioUrl, null, "跨账号重新签名只允许接续，不会把unknown改成成功或重试");
});

test("a signed mock or rule fallback is not promoted into a live continuation", () => {
  for (const flags of [{ mock: true }, { fallback: true }, { providerMeta: { provider: "maas", realProvider: false } }]) {
    const { canonical, snapshot } = fixture();
    snapshot.storybooks[0].pages[0].response = attestAiResult({ ...canonical, ...flags }, context);
    assert.equal(resolveAuthorizedStoredStorybookContinuation({ user: parent, snapshot, storyId: canonical.storyId, childId: "c-1" }), null);
  }
});

test("a different parent, class, institution, or revoked child scope cannot resume the saved book", () => {
  const { canonical, snapshot } = fixture();
  const denied = [
    { ...parent, id: "different-parent", childIds: [] },
    { ...parent, role: "教师" as const, id: "different-teacher", className: "其他班" },
    { ...parent, institutionId: "other-institution" },
  ];
  for (const user of denied) {
    assert.equal(resolveAuthorizedStoredStorybookContinuation({ user, snapshot, storyId: canonical.storyId, childId: "c-1" }), null);
  }
  snapshot.children = [];
  assert.equal(resolveAuthorizedStoredStorybookContinuation({ user: parent, snapshot, storyId: canonical.storyId, childId: "c-1" }), null);
});

test("a valid but stale signed response cannot clear already completed paid media", () => {
  const { canonical, stored } = fixture();
  const stale = attestAiResult({ ...canonical, scenes: [{ ...canonical.scenes[0], imageStatus: "pending", imageUrl: null, audioStatus: "pending", audioUrl: null }] }, context);
  assert.throws(() => assertSafePersistedStorybookUpdate(stored, [{ response: stale }], context), /缺少已完成媒体/u);
  assert.deepEqual(stored.pages[0].response.scenes, canonical.scenes);
});

test("fresh same-scope attested media completion is accepted while forged replacement is rejected", () => {
  const { canonical, stored } = fixture();
  const fresh = attestAiResult({ ...canonical, scenes: [...canonical.scenes, { ...canonical.scenes[0], sceneIndex: 2 }] }, context);
  assert.doesNotThrow(() => assertSafePersistedStorybookUpdate(stored, [{ response: fresh }], context));
  assert.throws(() => assertSafePersistedStorybookUpdate(stored, [{ response: { ...fresh, title: "伪造新标题" } }], context), /来源验证失败/u);
  assert.throws(() => assertSafePersistedStorybookUpdate(stored, [{ response: fresh }], { ...context, userId: parent.id }), /来源验证失败/u);
});
