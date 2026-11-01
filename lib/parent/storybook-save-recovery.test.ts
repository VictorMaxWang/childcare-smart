import assert from "node:assert/strict";
import test from "node:test";
import type { ParentStoryBookResponse } from "@/lib/ai/types";
import type { ApiStorybook } from "@/lib/api/types";
import { canAdvanceSavedStorybook, clearPendingStorybookSave, createPendingStorybookSave, loadPendingStorybookSave, storePendingStorybookSave } from "./storybook-save-recovery";

const scope = { userId: "synthetic-owner", institutionId: "synthetic-institution", childId: "synthetic-child" };
function story() {
  return { storyId: "synthetic-story", childId: scope.childId, generatedAt: "2026-11-01T00:00:00Z", title: "合成绘本", summary: "合成", moral: "温和回应", parentNote: "合成回归", stylePreset: "sunrise-watercolor", mode: "storybook", source: "ai", fallback: false,
    provenanceAttestation: "synthetic-original-attestation", providerMeta: { provider: "maas", realProvider: true, imageDelivery: "mixed", audioDelivery: "mixed", diagnostics: { text: { model: "qwen3.8-flash", requestId: "same-generation" }, image: { readySceneCount: 0 } } },
    scenes: [{ sceneIndex: 1, sceneTitle: "合成页", sceneText: "照护者陪伴观察", imagePrompt: "照护者和小兔", audioScript: "陪伴观察", voiceStyle: "gentle", highlightSource: "todayGrowth", imageStatus: "empty", imageUrl: null, assetRef: null, audioStatus: "empty", audioUrl: null, audioRef: null }],
  } as unknown as ParentStoryBookResponse;
}
function book(response: ParentStoryBookResponse): ApiStorybook { return { storybookId: response.storyId, childId: response.childId, pages: [{ response }] } as unknown as ApiStorybook; }
function complete() {
  const value = story();
  Object.assign(value, { provenanceAttestation: "synthetic-completed-attestation" });
  Object.assign(value.scenes[0], { imageStatus: "ready", imageUrl: "/api/ai/parent-storybook/media/image", assetRef: "same-image", imageSourceKind: "real", audioStatus: "ready", audioUrl: "/api/ai/parent-storybook/media/audio", audioRef: "same-audio" });
  Object.assign(value.providerMeta, { imageDelivery: "real", audioDelivery: "real", diagnostics: { ...value.providerMeta.diagnostics, image: { readySceneCount: 1 } } });
  return value;
}
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test("only a same-generation monotonic media completion can replace an older saved version", () => {
  assert.equal(canAdvanceSavedStorybook(book(story()), createPendingStorybookSave(scope, complete(), [])), true);
  const partial = complete(); Object.assign(partial.scenes[0], { audioStatus: "empty", audioUrl: null, audioRef: null });
  assert.equal(canAdvanceSavedStorybook(book(partial), createPendingStorybookSave(scope, complete(), [])), true);
});
test("a different story body, generation time, text model or style never qualifies as a media completion", () => {
  const variants = [
    (value: ParentStoryBookResponse) => { value.title = "another title"; },
    (value: ParentStoryBookResponse) => { value.generatedAt = "2026-11-01T01:00:00Z"; },
    (value: ParentStoryBookResponse) => { value.scenes[0].sceneText = "different text"; },
    (value: ParentStoryBookResponse) => { value.scenes[0].imagePrompt = "different prompt"; },
    (value: ParentStoryBookResponse) => { value.stylePreset = "forest-crayon"; },
    (value: ParentStoryBookResponse) => { value.providerMeta.diagnostics!.text!.model = "another-model"; },
  ];
  for (const mutate of variants) { const next = complete(); mutate(next); assert.equal(canAdvanceSavedStorybook(book(story()), createPendingStorybookSave(scope, next, [])), false); }
});
test("ready image and audio cannot be removed, replaced or downgraded during retry", () => {
  for (const channel of ["image", "audio"] as const) for (const field of [`${channel}Url`, channel === "image" ? "assetRef" : "audioRef", `${channel}Status`]) {
    const next = complete(); Object.assign(next.scenes[0], { [field]: field.endsWith("Status") ? "empty" : "different-asset" });
    assert.equal(canAdvanceSavedStorybook(book(complete()), createPendingStorybookSave(scope, next, [])), false);
  }
});
test("capturing pending data keeps the entire original signed response independent of later rendering mutation", () => {
  const original = complete(), pending = createPendingStorybookSave(scope, original, ["synthetic-record"]);
  original.title = "changed after capture"; original.scenes[0].imageUrl = null;
  assert.deepEqual(pending.input.response, complete());
  assert.deepEqual(pending.input.sourceRecordIds, ["synthetic-record"]);
});
test("pending storage isolates the same child across accounts and institutions", () => {
  const cache = storage(), pending = createPendingStorybookSave(scope, complete(), []);
  assert.equal(storePendingStorybookSave(pending, cache), true);
  assert.deepEqual(loadPendingStorybookSave(scope, cache), pending);
  for (const other of [{ ...scope, userId: "another-parent" }, { ...scope, institutionId: "another-institution" }, { ...scope, childId: "another-child" }]) assert.equal(loadPendingStorybookSave(other, cache), null);
});
test("expired or corrupt scope/payload is not restored and disabled/oversized storage is reported", () => {
  for (const mutate of [
    (pending: ReturnType<typeof createPendingStorybookSave>) => { pending.createdAt -= 24 * 60 * 60 * 1000 + 1; },
    (pending: ReturnType<typeof createPendingStorybookSave>) => { pending.input.response.childId = "another-child"; },
    (pending: ReturnType<typeof createPendingStorybookSave>) => { pending.input.response.storyId = "another-book"; },
  ]) { const cache = storage(), pending = createPendingStorybookSave(scope, complete(), []); mutate(pending); storePendingStorybookSave(pending, cache); assert.equal(loadPendingStorybookSave(scope, cache), null); }
  assert.equal(storePendingStorybookSave(createPendingStorybookSave(scope, complete(), []), null), false);
  const huge = createPendingStorybookSave(scope, complete(), []); huge.input.response.extra = "x".repeat(1_000_001);
  const cache = storage(); assert.equal(storePendingStorybookSave(huge, cache), false); assert.equal(cache.data.size, 0);
});
test("an older save finishing cannot clear the newer media payload awaiting persistence", () => {
  const cache = storage(), older = createPendingStorybookSave(scope, story(), []), newer = createPendingStorybookSave(scope, complete(), []);
  storePendingStorybookSave(newer, cache); clearPendingStorybookSave(older, cache);
  assert.deepEqual(loadPendingStorybookSave(scope, cache), newer);
  clearPendingStorybookSave(newer, cache); assert.equal(loadPendingStorybookSave(scope, cache), null);
});
