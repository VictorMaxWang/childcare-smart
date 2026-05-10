import type { ParentStoryBookResponse, ParentStoryBookScene } from "@/lib/ai/types";

export const LIN_XIAOYU_FIXED_STORYBOOK_ID = "lin-xiaoyu-one-small-brave-step";
export const LIN_XIAOYU_FIXED_STORYBOOK_TITLE = "林小雨的一小步勇敢";
export const LIN_XIAOYU_FIXED_STORYBOOK_SUBTITLE = "成长绘本 · 勇敢练习";
export const LIN_XIAOYU_CHILD_ID = "c-1";
export const LIN_XIAOYU_CHILD_ALIAS = "lin-xiaoyu";
export const LIN_XIAOYU_CHILD_NAME = "林小雨";
export const LIN_XIAOYU_IMAGE_BASE = "/demo-media/storybooks/lin-xiaoyu/images";
export const LIN_XIAOYU_AUDIO_BASE = "/demo-media/storybooks/lin-xiaoyu/audio";
export const LIN_XIAOYU_IMAGE_FALLBACK = "/demo-media/storybooks/demo-storybook-placeholder.svg";

export type LinXiaoyuFixedStorybookPage = {
  page: number;
  pageId: string;
  title: string;
  imageSrc: string;
  audioSrc: string;
  text: string;
  imagePrompt: string;
};

export const LIN_XIAOYU_FIXED_STORYBOOK_PAGES: LinXiaoyuFixedStorybookPage[] = [
  {
    page: 1,
    pageId: "page-01",
    title: "小雨有点害怕",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-01.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-01.mp3`,
    text: "今天，林小雨听见走廊里“哗啦”一声。\n她抱紧小兔，小声说：“我有一点害怕。”",
    imagePrompt:
      "温暖治愈儿童绘本风格，幼儿园活动室，窗外小雨，5岁小女孩林小雨抱着小兔玩偶站在门口，看向走廊尽头的暗影，表情紧张但可爱，柔和水彩，暖色灯光，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
  {
    page: 2,
    pageId: "page-02",
    title: "老师说，害怕也没关系",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-02.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-02.mp3`,
    text: "老师蹲下来，说：“害怕也没关系。我们先吸一口气，再慢慢吐出来。”\n林小雨跟着做了一次，心里好像亮了一点点。",
    imagePrompt:
      "温暖儿童绘本风格，幼儿园老师蹲下与小女孩平视交流，老师温柔示范深呼吸，小女孩抱着小兔玩偶模仿呼吸，安全感强，柔和水彩，温暖光线，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
  {
    page: 3,
    pageId: "page-03",
    title: "先走一小步",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-03.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-03.mp3`,
    text: "老师说：“勇敢不是一下子跑过去。勇敢可以是先走一小步。”\n林小雨看着前面，轻轻迈出了一步。",
    imagePrompt:
      "温暖治愈儿童绘本风格，幼儿园走廊入口，小女孩林小雨抱着小兔玩偶，身边有老师陪伴，小女孩小心迈出一步，走廊里有雨伞和雨鞋形成的柔和影子，不恐怖，水彩质感，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
  {
    page: 4,
    pageId: "page-04",
    title: "原来是小风铃",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-04.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-04.mp3`,
    text: "“叮铃铃——”\n林小雨终于看清楚了。\n原来不是怪声音，是窗边的小风铃在唱歌。",
    imagePrompt:
      "温暖儿童绘本风格，幼儿园走廊窗边，小女孩林小雨和老师发现一个可爱的小风铃被风吹动，女孩表情惊讶又放松，窗外小雨，室内温暖明亮，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
  {
    page: 5,
    pageId: "page-05",
    title: "小雨帮助了别人",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-05.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-05.mp3`,
    text: "这时，一个小弟弟也小声说：“我害怕。”\n林小雨想了想，说：“没关系，我们可以一起走一小步。”",
    imagePrompt:
      "温暖治愈儿童绘本风格，幼儿园走廊，一个5岁小女孩林小雨温柔牵着更小的小朋友，另一只手展示小兔玩偶，老师在后方微笑陪伴，气氛安全温馨，柔和水彩，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
  {
    page: 6,
    pageId: "page-06",
    title: "勇敢的小雨",
    imageSrc: `${LIN_XIAOYU_IMAGE_BASE}/page-06.webp`,
    audioSrc: `${LIN_XIAOYU_AUDIO_BASE}/page-06.mp3`,
    text: "林小雨还是会害怕。\n可是她知道了：\n勇敢不是不害怕，勇敢是害怕的时候，也愿意试一小步。",
    imagePrompt:
      "温暖儿童绘本风格，幼儿园活动室，雨后彩虹从窗外出现，小女孩林小雨自信微笑，举着小兔玩偶，身边小朋友开心玩耍，老师温柔鼓掌，明亮治愈，柔和水彩，画面无任何文字、无字母、无标牌、无数字、无水印。",
  },
];

export function resolveLinXiaoyuChildId(childId?: string | null) {
  const normalized = childId?.trim();
  if (!normalized) return normalized;
  if (normalized === LIN_XIAOYU_CHILD_ALIAS) return LIN_XIAOYU_CHILD_ID;
  return normalized;
}

export function isLinXiaoyuFixedStorybookChild(childId?: string | null) {
  return resolveLinXiaoyuChildId(childId) === LIN_XIAOYU_CHILD_ID;
}

export function getLinXiaoyuFixedStorybookPage(page: number | string | null | undefined) {
  const rawPage = typeof page === "string" ? Number(page) : page;
  if (!Number.isInteger(rawPage)) return null;
  return LIN_XIAOYU_FIXED_STORYBOOK_PAGES.find((item) => item.page === rawPage) ?? null;
}

export function linXiaoyuFixedStorybookScenes(): ParentStoryBookScene[] {
  return LIN_XIAOYU_FIXED_STORYBOOK_PAGES.map((page) => ({
    sceneIndex: page.page,
    sceneTitle: page.title,
    sceneText: page.text,
    imagePrompt: page.imagePrompt,
    imageUrl: page.imageSrc,
    assetRef: LIN_XIAOYU_IMAGE_FALLBACK,
    imageSourceKind: "real",
    imageStatus: "ready",
    audioUrl: page.audioSrc,
    audioRef: `/api/storybooks/lin-xiaoyu/tts?childId=${LIN_XIAOYU_CHILD_ID}&page=${page.page}`,
    audioScript: page.text,
    audioStatus: "ready",
    voiceStyle: "温柔女声 · 儿童绘本朗读 · 语速略慢",
    engineId: "short_audio_synthesis_jovi",
    voiceName: "yige",
    highlightSource: page.pageId,
    captionTiming: {
      mode: "duration-derived",
      segmentTexts: page.text.split("\n").filter(Boolean),
    },
  }));
}

export function buildLinXiaoyuFixedStorybookResponse(
  options: { generatedAt?: string } = {}
): ParentStoryBookResponse {
  const scenes = linXiaoyuFixedStorybookScenes();
  const generatedAt = options.generatedAt ?? "2026-05-10T08:00:00.000Z";

  return {
    storyId: LIN_XIAOYU_FIXED_STORYBOOK_ID,
    childId: LIN_XIAOYU_CHILD_ID,
    mode: "storybook",
    title: LIN_XIAOYU_FIXED_STORYBOOK_TITLE,
    summary: LIN_XIAOYU_FIXED_STORYBOOK_SUBTITLE,
    moral: "勇敢不是不害怕，勇敢是害怕的时候，也愿意试一小步。",
    parentNote: "固定演示绘本使用本地静态图片和预生成朗读音频；vivo 不可用时仍可稳定阅读图文。",
    source: "rule",
    fallback: false,
    fallbackReason: null,
    generatedAt,
    stylePreset: "sunrise-watercolor",
    providerMeta: {
      provider: "fixed-storybook",
      mode: "locked-static",
      transport: "next-json-fallback",
      imageProvider: "public-static-webp",
      audioProvider: "vivo-static-audio",
      imageDelivery: "real",
      audioDelivery: "real",
      stylePreset: "sunrise-watercolor",
      requestSource: "storybook-lock-01",
      fallbackReason: null,
      realProvider: true,
      highlightCount: scenes.length,
      sceneCount: scenes.length,
      diagnostics: {
        brain: {
          reachable: true,
          fallbackReason: null,
          upstreamHost: null,
          elapsedMs: 0,
          timeoutMs: 0,
        },
        image: {
          requestedProvider: "public-static-webp",
          resolvedProvider: "public-static-webp",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: scenes.length,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 0,
        },
        audio: {
          requestedProvider: "vivo-static-audio",
          resolvedProvider: "vivo-static-audio",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: scenes.length,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 0,
        },
      },
    },
    scenes,
    cacheMeta: {
      storyResponse: "hit",
      audioDelivery: "stream-url",
      ttlSeconds: 86400,
      realSceneCount: scenes.length,
    },
  };
}
