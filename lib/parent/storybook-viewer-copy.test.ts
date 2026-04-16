import assert from "node:assert/strict";
import test from "node:test";

import {
  describeStoryBookMode,
  formatStoryBookAudioDelivery,
  formatStoryBookFallbackReason,
  formatStoryBookHighlightSource,
  formatStoryBookProviderLabel,
  formatStoryBookResponseCache,
  formatStoryBookSceneImageDelivery,
  formatStoryBookSceneStatus,
  formatStoryBookTransport,
  formatStoryBookVoiceStyle,
  getStoryBookPresetCopy,
} from "./storybook-viewer-copy.ts";

test("describeStoryBookMode maps live mixed fallback to Chinese labels and summaries", () => {
  assert.deepEqual(describeStoryBookMode("live"), {
    label: "真实媒体",
    summary: "当前图片和音频都命中真实链路，页面展示的是完整实时结果。",
    badgeVariant: "success",
  });
  assert.deepEqual(describeStoryBookMode("mixed"), {
    label: "混合交付",
    summary: "当前只有部分页面命中真实媒体，其余页面仍使用真实补齐中的回退结果。",
    badgeVariant: "warning",
  });
  assert.deepEqual(describeStoryBookMode("fallback"), {
    label: "回退交付",
    summary: "当前主要展示回退插画和本地补读或字幕预演，不宣称真实媒体已完全恢复。",
    badgeVariant: "secondary",
  });
});

test("storybook viewer copy maps media status and playback labels", () => {
  assert.equal(formatStoryBookSceneStatus("image", "ready"), "已生成插画");
  assert.equal(formatStoryBookSceneStatus("image", "fallback"), "回退插画");
  assert.equal(formatStoryBookSceneStatus("audio", "ready"), "已生成音频");
  assert.equal(formatStoryBookSceneStatus("audio", "mock"), "示例音轨");
  assert.equal(formatStoryBookVoiceStyle("gentle-bedtime"), "晚安轻声");
  assert.equal(formatStoryBookVoiceStyle("warm-storytelling"), "温柔讲述");
});

test("storybook viewer copy maps provider, cache, transport and fallback reasons", () => {
  assert.equal(
    formatStoryBookProviderLabel("image", "vivo-story-image+storybook-dynamic-fallback"),
    "插画：vivo 真实图片 + 动态剧情插画"
  );
  assert.equal(
    formatStoryBookProviderLabel("audio", "storybook-mock-preview"),
    "音频：字幕预演"
  );
  assert.equal(formatStoryBookResponseCache("hit"), "响应缓存命中");
  assert.equal(formatStoryBookAudioDelivery("preview-only"), "字幕预演");
  assert.equal(formatStoryBookAudioDelivery("local-speech"), "本地补读");
  assert.equal(formatStoryBookSceneImageDelivery("dynamic-fallback"), "动态剧情插画");
  assert.equal(formatStoryBookSceneImageDelivery("svg-fallback"), "SVG 兜底插画");
  assert.equal(formatStoryBookTransport("remote-brain-proxy"), "FastAPI 实时链路");
  assert.equal(formatStoryBookHighlightSource("interventionCard"), "今晚动作");
  assert.equal(formatStoryBookFallbackReason("brain-status-504"), "上游 brain 返回 504");
  assert.equal(
    formatStoryBookFallbackReason("brain-base-url-missing"),
    "未配置 BRAIN_API_BASE_URL"
  );
});

test("getStoryBookPresetCopy returns preset metadata", () => {
  const preset = getStoryBookPresetCopy("forest-crayon");

  assert.equal(preset.shortLabel, "森林");
  assert.match(preset.description, /活泼|绘本|演示/);
});
