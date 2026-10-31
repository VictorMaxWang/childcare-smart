import assert from "node:assert/strict";
import test from "node:test";
import type { ParentStoryBookScene } from "@/lib/ai/types";
import { mergeScenesWithRealText } from "./parent-storybook-real-text";

test("new local real-text scenes rebuild caption timing and never fall back to a template image plot", () => {
  const original: ParentStoryBookScene = { sceneIndex: 1, sceneTitle: "种子页", sceneText: "种子月光", audioScript: "种子字幕", imagePrompt: "种子卧室积木", imageStatus: "empty", audioStatus: "empty", voiceStyle: "gentle-bedtime", highlightSource: "record",
    captionTiming: { mode: "tts-cues", segmentTexts: ["种子字幕"], segmentDurationsMs: [99000] } };
  const before = structuredClone(original);
  const [scene] = mergeScenesWithRealText([original], [{ sceneTitle: "清晨", sceneText: "清晨阳光暖，悠悠捧小杯。", audioScript: "清晨阳光暖，悠悠捧小杯。" }]);
  assert.equal(scene.captionTiming?.mode, "duration-derived");
  assert.deepEqual(scene.captionTiming?.segmentTexts, [scene.audioScript]);
  assert.ok(scene.captionTiming!.segmentDurationsMs![0] < 99000);
  assert.ok(scene.imagePrompt.includes(scene.sceneText));
  assert.doesNotMatch(scene.imagePrompt, /种子/u);
  assert.deepEqual(original, before);
});
