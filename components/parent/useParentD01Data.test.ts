import assert from "node:assert/strict";
import test from "node:test";
import type { DemoStorybook } from "@/lib/persistence/snapshot";
import { restoreParentStorybookResponse } from "./useParentD01Data";
import { shouldPollParentStoryBookMedia } from "@/lib/parent/storybook-cache";
import { attestAiResult, verifyAiResultAttestation } from "@/lib/ai/provenance-attestation";

test("restoring an attested book leaves its complete signed JSON unchanged", () => {
  const context = { userId: "teacher-a", institutionId: "institution-a", scopeId: "child-a", capability: "parent-storybook" };
  const signed = attestAiResult({
    storyId: "signed-book", childId: "child-a", title: "真实绘本", source: "ai", fallback: false,
    providerMeta: { provider: "maas", realProvider: true, imageProvider: "maas-z-image", audioProvider: "maas-tts" },
    scenes: [{ sceneIndex: 1, sceneTitle: "真实一页", sceneText: "一起捧小杯。", audioScript: "一起捧小杯。", imageStatus: "ready", audioStatus: "ready", imageUrl: "/api/private-image", audioUrl: "/api/private-audio" }],
  }, context);
  const saved = { storybookId: signed.storyId, childId: signed.childId, generatedAt: "2026-10-31T00:00:00.000Z", sourceRecordIds: [], pages: [{ response: signed }] } as unknown as DemoStorybook;
  const restored = restoreParentStorybookResponse(saved, "合成儿童");
  assert.equal(verifyAiResultAttestation(restored, context), true, "展示恢复不能给签名正文补默认字段");
  assert.deepEqual(restored, signed);
});

test("restoring a saved MaaS book preserves provider truth and unfinished media tasks", () => {
  const diagnostics = {
    brain: { reachable: true, fallbackReason: null, upstreamHost: "brain.example.test" },
    image: { requestedProvider: "maas", resolvedProvider: "maas-z-image", liveEnabled: true, missingConfig: [], jobStatus: "warming", pendingSceneCount: 2, retryAfterMs: 4_000 },
    audio: { requestedProvider: "maas", resolvedProvider: "maas-tts", liveEnabled: true, missingConfig: [], jobStatus: "warming", pendingSceneCount: 1 },
  };
  const saved = { storybookId: "saved-book", childId: "child-a", generatedAt: "2026-10-31T01:00:00.000Z", sourceRecordIds: ["record-a"], pages: [{ response: {
    storyId: "saved-book", childId: "child-a", title: "小兔成长", mode: "storybook", source: "ai", fallback: false, fallbackReason: null,
    providerMeta: { provider: "maas", textProvider: "maas", textDelivery: "real", realProvider: true, fallbackReason: null,
      imageProvider: "maas-z-image", audioProvider: "maas-tts", imageDelivery: "mixed", audioDelivery: "mixed", diagnostics },
    scenes: [{ sceneIndex: 1, sceneTitle: "一起尝试", sceneText: "小兔慢慢试着搭积木。", audioScript: "小兔慢慢试着搭积木。", imageStatus: "pending", audioStatus: "pending" }],
  } }] } as unknown as DemoStorybook;
  const restored = restoreParentStorybookResponse(saved, "合成儿童");
  assert.equal(restored.providerMeta.textProvider, "maas");
  assert.equal(restored.providerMeta.textDelivery, "real");
  assert.equal(restored.fallbackReason, null);
  assert.equal(restored.providerMeta.fallbackReason, null);
  assert.deepEqual(restored.providerMeta.diagnostics, diagnostics);
  assert.equal(shouldPollParentStoryBookMedia(restored), true);
});
