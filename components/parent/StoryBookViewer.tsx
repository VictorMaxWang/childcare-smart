"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type SyntheticEvent,
} from "react";
import {
  ArrowLeft,
  AudioLines,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PARENT_STORYBOOK_PRESETS, splitStoryBookCaptionSegments } from "@/lib/agent/parent-storybook-presets";
import type {
  ParentStoryBookGenerationMode,
  ParentStoryBookPageCount,
  ParentStoryBookResponse,
  ParentStoryBookScene,
  ParentStoryBookStylePreset,
  ParentStoryBookStyleMode,
} from "@/lib/ai/types";
import {
  describeStoryBookMode,
  formatStoryBookClientCache,
  formatStoryBookFallbackReason,
  formatStoryBookHighlightSource,
  formatStoryBookResponseCache,
  formatStoryBookSceneImageDelivery,
  formatStoryBookVoiceStyle,
  getStoryBookPresetCopy,
} from "@/lib/parent/storybook-viewer-copy";
import { cn } from "@/lib/utils";

type StoryBookViewerStatus = "loading" | "storybook" | "card" | "empty" | "error";
type PlaybackState = "idle" | "loading" | "playing" | "paused" | "preview" | "local";
type StoryBookTheme = ReturnType<typeof getTheme>;
type StoryBookRuntimeTransport = "remote-brain-proxy" | "next-json-fallback" | "next-stream-fallback";
type StoryBookRuntimeImageDelivery = "real" | "dynamic-fallback" | "demo-art" | "svg-fallback";
type StoryBookPublicImageDelivery = "real" | "mixed" | "dynamic-fallback" | "svg-fallback";
type StoryBookRuntimeDiagnostics = {
  brain?: {
    reachable?: boolean;
    fallbackReason?: string | null;
    upstreamHost?: string | null;
    elapsedMs?: number | null;
    timeoutMs?: number | null;
  } | null;
  image?: {
    requestedProvider?: string;
    resolvedProvider?: string;
    liveEnabled?: boolean;
    missingConfig?: string[];
    jobStatus?: string | null;
    pendingSceneCount?: number;
    readySceneCount?: number;
    errorSceneCount?: number;
    lastErrorStage?: string | null;
    lastErrorReason?: string | null;
    elapsedMs?: number | null;
  } | null;
  audio?: {
    requestedProvider?: string;
    resolvedProvider?: string;
    liveEnabled?: boolean;
    missingConfig?: string[];
    jobStatus?: string | null;
    pendingSceneCount?: number;
    readySceneCount?: number;
    errorSceneCount?: number;
    lastErrorStage?: string | null;
    lastErrorReason?: string | null;
    elapsedMs?: number | null;
  } | null;
} | null;
type StoryBookRuntimeProviderMeta = ParentStoryBookResponse["providerMeta"] & {
  transport?: StoryBookRuntimeTransport;
  imageDelivery?: StoryBookRuntimeImageDelivery | "mixed" | "real";
  diagnostics?: StoryBookRuntimeDiagnostics;
};
type StoryBookRuntimeScene = ParentStoryBookScene & {
  imageSourceKind?: StoryBookRuntimeImageDelivery;
};
type StoryBookRuntimeResponse = ParentStoryBookResponse & {
  providerMeta: StoryBookRuntimeProviderMeta;
  scenes: StoryBookRuntimeScene[];
};
type StoryBookAudioDelivery =
  | ParentStoryBookResponse["providerMeta"]["audioDelivery"]
  | NonNullable<ParentStoryBookResponse["cacheMeta"]>["audioDelivery"];
type PlaybackSource = "real" | "local" | "preview";
type StoryBookRuntimeAudioDelivery = "real" | "mixed" | "preview-only" | "local-speech";
type StoryBookRuntimeOverrides = {
  canUseLocalSpeech?: boolean;
  playbackSource?: PlaybackSource;
  playbackSceneIndex?: number | null;
  imageFallbackMap?: Record<string, boolean>;
};
type StoryBookResolvedRuntimeState = {
  imageDelivery: StoryBookPublicImageDelivery;
  audioDelivery: StoryBookRuntimeAudioDelivery;
  mode: "live" | "mixed" | "fallback";
};
type ScenePlaybackOptions = { continueBook?: boolean };
type StoryBookSceneRuntimeState = {
  storyId: string | null;
  playbackSource: PlaybackSource;
  playbackSceneIndex: number | null;
  imageFallbackMap: Record<string, boolean>;
};
type StoryBookImageProps = {
  src: string;
  alt: string;
  className?: string;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
};
const StoryBookLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function StoryBookLink({ children, href, ...props }, ref) {
    return (
      <a ref={ref} href={typeof href === "string" ? href : undefined} {...props}>
        {children}
      </a>
    );
  }
);

type SceneCaptionTiming = NonNullable<ParentStoryBookScene["captionTiming"]>;
type CaptionSegmentRange = {
  start: number;
  end: number;
};
type CaptionTimeline = {
  timing: SceneCaptionTiming;
  segments: string[];
  durationsMs: number[];
  startsMs: number[];
  totalDurationMs: number;
  ranges: CaptionSegmentRange[];
  rawText: string;
};

const PREVIEW_MIN_SEGMENT_MS = 2400;

function normalizeCaptionText(value: string) {
  return value
    .replace(/\s+/gu, " ")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .trim();
}

function buildCaptionDurationMs(segment: string) {
  const contentLength = segment.replace(/\s+/gu, "").length;
  const punctuationCount = segment.match(/[，,；;：:。！？!?]/gu)?.length ?? 0;
  return Math.max(PREVIEW_MIN_SEGMENT_MS, 1700 + contentLength * 95 + punctuationCount * 220);
}

export function resolveSceneCaptionTiming(scene: ParentStoryBookScene): SceneCaptionTiming {
  const rawText = normalizeCaptionText(scene.audioScript || scene.sceneText || "");
  const segmentsFromTiming = scene.captionTiming?.segmentTexts
    ?.map((segment) => normalizeCaptionText(segment))
    .filter(Boolean);
  const segmentsFromFallback = splitStoryBookCaptionSegments(rawText)
    .map((segment) => normalizeCaptionText(segment))
    .filter(Boolean);
  const segments = (segmentsFromTiming?.length ? segmentsFromTiming : segmentsFromFallback)
    .filter(Boolean);
  const safeSegments = segments.length > 0 ? segments : rawText ? [rawText] : [];
  const providedDurations = scene.captionTiming?.segmentDurationsMs ?? [];
  const durationsMs = safeSegments.map((segment, index) => {
    const provided = providedDurations[index];
    if (Number.isFinite(provided) && (provided ?? 0) > 0) {
      return Math.max(
        scene.captionTiming?.mode === "tts-cues" ? 240 : PREVIEW_MIN_SEGMENT_MS,
        Math.round(provided ?? 0)
      );
    }
    return buildCaptionDurationMs(segment);
  });

  return {
    mode: scene.captionTiming?.mode ?? "duration-derived",
    segmentTexts: safeSegments,
    segmentDurationsMs: durationsMs,
  };
}

export function buildCaptionTimeline(scene: ParentStoryBookScene): CaptionTimeline {
  const timing = resolveSceneCaptionTiming(scene);
  const segments = timing.segmentTexts;
  const durationsMs = timing.segmentDurationsMs ?? segments.map(buildCaptionDurationMs);
  const startsMs: number[] = [];
  const ranges: CaptionSegmentRange[] = [];
  let accumulated = 0;
  let cursor = 0;
  const rawText = scene.audioScript || scene.sceneText || "";

  segments.forEach((segment, index) => {
    startsMs.push(accumulated);
    const durationMs = Math.max(0, durationsMs[index] ?? buildCaptionDurationMs(segment));
    accumulated += durationMs;

    const normalizedSegment = normalizeCaptionText(segment);
    const start = rawText.indexOf(normalizedSegment, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const safeEnd = Math.max(safeStart, safeStart + normalizedSegment.length);
    cursor = safeEnd;
    ranges.push({ start: safeStart, end: safeEnd });
  });

  return {
    timing,
    segments,
    durationsMs,
    startsMs,
    totalDurationMs: accumulated,
    ranges,
    rawText,
  };
}

export function getCaptionIndexForElapsedMs(timeline: CaptionTimeline, elapsedMs: number) {
  if (!timeline.segments.length) return 0;
  const safeElapsed = Math.max(0, elapsedMs);
  for (let index = 0; index < timeline.durationsMs.length; index += 1) {
    const boundary = timeline.startsMs[index] + timeline.durationsMs[index];
    if (safeElapsed < boundary) return index;
  }
  return timeline.segments.length - 1;
}

export function getCaptionIndexForCharIndex(timeline: CaptionTimeline, charIndex: number) {
  if (!timeline.segments.length) return 0;
  const safeCharIndex = Math.max(0, charIndex);
  for (let index = 0; index < timeline.ranges.length; index += 1) {
    if (safeCharIndex < timeline.ranges[index].end) return index;
  }
  return timeline.segments.length - 1;
}

function getTheme(preset: ParentStoryBookStylePreset) {
  if (preset === "moonlit-cutout") {
    return {
      page: "bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.95),_rgba(191,219,254,0.82)_30%,_rgba(224,231,255,0.76)_62%,_rgba(248,250,252,1)_100%)]",
      panel: "bg-white/82 border-white/70",
      accent: "bg-sky-600 text-white hover:bg-sky-600/90",
      quiet: "border-sky-200/80 bg-white/80 text-sky-900 hover:bg-sky-50",
      dot: "bg-sky-600",
      dotIdle: "bg-sky-100",
      chip: "bg-sky-100 text-sky-700",
      progress: "bg-gradient-to-r from-sky-600 via-indigo-500 to-slate-500",
    };
  }
  if (preset === "forest-crayon") {
    return {
      page: "bg-[radial-gradient(circle_at_top_right,_rgba(220,252,231,0.92),_rgba(187,247,208,0.78)_30%,_rgba(254,249,195,0.66)_58%,_rgba(248,250,252,1)_100%)]",
      panel: "bg-white/82 border-white/70",
      accent: "bg-emerald-600 text-white hover:bg-emerald-600/90",
      quiet: "border-emerald-200/80 bg-white/80 text-emerald-900 hover:bg-emerald-50",
      dot: "bg-emerald-600",
      dotIdle: "bg-emerald-100",
      chip: "bg-emerald-100 text-emerald-700",
      progress: "bg-gradient-to-r from-emerald-600 via-lime-500 to-amber-400",
    };
  }
  return {
    page: "bg-[radial-gradient(circle_at_top_left,_rgba(255,245,220,0.95),_rgba(254,226,226,0.75)_32%,_rgba(224,242,254,0.9)_68%,_rgba(248,250,252,1)_100%)]",
    panel: "bg-white/82 border-white/70",
    accent: "bg-amber-500 text-white hover:bg-amber-500/90",
    quiet: "border-amber-200/80 bg-white/80 text-amber-900 hover:bg-amber-50",
    dot: "bg-amber-500",
    dotIdle: "bg-amber-100",
    chip: "bg-amber-100 text-amber-700",
    progress: "bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400",
  };
}

function formatSeconds(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function StoryBookImage({ src, alt, className, onError }: StoryBookImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className ?? "h-full w-full object-cover"}
      loading="eager"
      decoding="async"
      onError={onError}
    />
  );
}

function getGenerationModeCopy(mode: ParentStoryBookGenerationMode) {
  switch (mode) {
    case "manual-theme":
      return {
        label: "主题生成",
        description: "只围绕手动输入的教育主题生成完整成长绘本，不读取孩子个体数据。",
      };
    case "hybrid":
      return {
        label: "混合生成",
        description: "把手动主题和当前孩子的成长线索一起编织成更贴身的绘本。",
      };
    default:
      return {
        label: "个性化生成",
        description: "基于当前孩子的成长信息、反馈与建议生成个性化成长绘本。",
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPlaybackActionTextV2(
  scene: ParentStoryBookScene,
  isPlaying: boolean,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  if (scene.audioStatus === "ready" && scene.audioUrl) {
    if (playbackState === "paused" && isPlaying) return "继续朗读";
    if (isPlaying) return "暂停朗读";
    return "播放朗读";
  }
  if (playbackState === "preview") {
    return isPlaying ? "停止预演" : "字幕预演";
  }
  if (canUseLocalSpeech) {
    if (playbackState === "paused" && isPlaying) return "继续本地朗读";
    if (playbackState === "local" && isPlaying) return "暂停本地朗读";
    return "本地朗读";
  }
  return isPlaying ? "停止预演" : "字幕预演";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getCaptionStatusTextV2(
  scene: ParentStoryBookScene,
  isPlaying: boolean,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  if (scene.audioStatus === "ready" && scene.audioUrl) {
    if (playbackState === "loading" && isPlaying) return "正在加载真实朗读";
    if (playbackState === "paused" && isPlaying) return "真实朗读已暂停";
    if (isPlaying) return "真实朗读播放中";
    return "真实朗读已就绪";
  }
  if (playbackState === "preview") {
    return isPlaying ? "当前仅在进行字幕预演" : "当前仅字幕预演，未生成真实音频";
  }
  if (canUseLocalSpeech) {
    if (playbackState === "loading" && isPlaying) return "正在准备本地朗读";
    if (playbackState === "paused" && isPlaying) return "本地朗读已暂停";
    if (isPlaying) return "本地朗读播放中";
    return "当前使用本地朗读";
  }
  return isPlaying ? "当前仅在进行字幕预演" : "当前仅字幕预演，未生成真实音频";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPlaybackTimeLabelV2(
  scene: ParentStoryBookScene,
  isSceneActive: boolean,
  currentTime: number,
  duration: number,
  canUseLocalSpeech: boolean,
  playbackState: PlaybackState
) {
  if (isSceneActive && duration > 0) {
    return `${formatSeconds(currentTime)} / ${formatSeconds(duration)}`;
  }
  if (scene.audioStatus === "ready" && scene.audioUrl) {
    return "可播放";
  }
  if (playbackState === "preview") {
    return "仅字幕预演";
  }
  if (canUseLocalSpeech) {
    return playbackState === "local" ? "本地朗读" : "可本地朗读";
  }
  return "仅字幕预演";
}

function getBookPlaybackLabel(
  audioDelivery?: StoryBookAudioDelivery,
  canUseLocalSpeech = false,
  isBookPlaying?: boolean
) {
  if (isBookPlaying) return "停止全书";
  if (audioDelivery === "real") {
    return "播放全书";
  }
  if (audioDelivery === "mixed") {
    return canUseLocalSpeech ? "播放全书（含本地补读）" : "播放全书（含字幕预演页）";
  }
  if (canUseLocalSpeech) return "播放全书（本地补读）";
  return "全书字幕预演";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSceneAudioBadgeLabel(
  scene: ParentStoryBookScene,
  canUseLocalSpeech: boolean
) {
  if (scene.audioStatus === "ready" && scene.audioUrl) return "真实朗读";
  if (canUseLocalSpeech) return "本地朗读";
  return "字幕预演";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSceneAudioPlayingLabel(
  scene: ParentStoryBookScene,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  if (scene.audioStatus === "ready" && scene.audioUrl) {
    if (playbackState === "paused") return "真实朗读已暂停";
    return "真实朗读中";
  }
  if (canUseLocalSpeech) {
    if (playbackState === "paused") return "本地朗读已暂停";
    return "本地朗读中";
  }
  return "字幕预演中";
}

export function getStoryAudioRuntimeLabel(
  audioDelivery?: StoryBookAudioDelivery,
  canUseLocalSpeech = false
) {
  if (audioDelivery === "real" || audioDelivery === "stream-url" || audioDelivery === "inline-data-url") {
    return "真实逐页朗读";
  }
  if (audioDelivery === "mixed") {
    return canUseLocalSpeech ? "部分真实朗读 + 本地补读" : "部分真实朗读 + 字幕预演";
  }
  return canUseLocalSpeech
    ? "后端真实朗读未命中，本地补读"
    : "后端真实朗读未命中，字幕预演";
}

function getRuntimeStory(story: ParentStoryBookResponse | null | undefined) {
  return story as StoryBookRuntimeResponse;
}

function getRuntimeSceneImageDelivery(scene: StoryBookRuntimeScene) {
  if (scene.imageSourceKind) return scene.imageSourceKind;
  if (scene.imageStatus === "ready") return "real";
  if (scene.imageStatus === "mock") return "demo-art";
  if (scene.imageStatus === "fallback" && (scene.imageUrl || scene.assetRef)) return "dynamic-fallback";
  return "svg-fallback";
}

function formatWarmProgressDetail(channel?: {
  pendingSceneCount?: number;
  readySceneCount?: number;
  errorSceneCount?: number;
  elapsedMs?: number | null;
  lastErrorReason?: string | null;
}) {
  if (!channel) return "等待下一次拉取更新。";
  const parts = [
    `ready ${channel.readySceneCount ?? 0}`,
    `pending ${channel.pendingSceneCount ?? 0}`,
  ];
  if ((channel.errorSceneCount ?? 0) > 0) {
    parts.push(`error ${channel.errorSceneCount ?? 0}`);
  }
  if (typeof channel.elapsedMs === "number") {
    parts.push(`elapsed ${channel.elapsedMs}ms`);
  }
  if (channel.lastErrorReason) {
    parts.push(`last error: ${channel.lastErrorReason}`);
  }
  return parts.join(" · ");
}

export function resolveRuntimeStoryMode(
  story: StoryBookRuntimeResponse | null | undefined
) {
  if (!story) return "fallback";
  const imageDelivery = story.providerMeta.imageDelivery;
  const audioDelivery = story.providerMeta.audioDelivery ?? story.cacheMeta?.audioDelivery;
  if (imageDelivery === "real" && audioDelivery === "real") {
    return "live";
  }
  if (
    imageDelivery === "mixed" ||
    audioDelivery === "mixed" ||
    imageDelivery === "real" ||
    audioDelivery === "real"
  ) {
    return "mixed";
  }
  return "fallback";
}

export function getRuntimeBannerItems(
  story: StoryBookRuntimeResponse | null | undefined,
  canUseLocalSpeech: boolean
) {
  if (!story) return [];

  const items: Array<{ tone: "warning" | "success" | "info"; label: string; detail: string }> = [];
  const diagnostics = story.providerMeta.diagnostics;
  const transport = story.providerMeta.transport;
  const imageDelivery = story.providerMeta.imageDelivery;
  const audioDelivery = story.providerMeta.audioDelivery;
  const brainTimingParts = [
    diagnostics?.brain?.upstreamHost ? `上游：${diagnostics.brain.upstreamHost}` : null,
    typeof diagnostics?.brain?.elapsedMs === "number" ? `耗时 ${diagnostics.brain.elapsedMs}ms` : null,
    typeof diagnostics?.brain?.timeoutMs === "number" ? `预算 ${diagnostics.brain.timeoutMs}ms` : null,
  ].filter(Boolean);

  if (transport === "remote-brain-proxy") {
    items.push({
      tone: "success",
      label: "绘本主链路已接通",
      detail: brainTimingParts.join(" · ") || "当前绘本内容来自实时生成链路。",
    });
  } else if (diagnostics?.brain?.reachable === false || transport === "next-json-fallback") {
    items.push({
      tone: "warning",
      label: "实时生成暂不可用，当前使用本地结果",
      detail: diagnostics?.brain?.fallbackReason
        ? `当前说明：${diagnostics.brain.fallbackReason}${brainTimingParts.length ? ` · ${brainTimingParts.join(" · ")}` : ""}`
        : brainTimingParts.join(" · ") || "当前内容暂以本地结果展示。",
    });
  } else {
    items.push({
      tone: "info",
      label: "生成状态待确认",
      detail: brainTimingParts.join(" · ") || "当前还没有收到完整的状态信息。",
    });
  }

  if (diagnostics?.image?.jobStatus === "warming") {
    items.push({
      tone: "info",
      label: "真实插画补齐中",
      detail: formatWarmProgressDetail(diagnostics.image),
    });
  } else if (imageDelivery === "real") {
    items.push({
      tone: "success",
      label: "真实插画已就绪",
      detail: "每页将优先展示真实生成的插画结果。",
    });
  } else if (imageDelivery === "mixed") {
    items.push({
      tone: "info",
      label: "部分页面已更新插画，其余页面先用动态插画补齐",
      detail: "当前会优先展示已生成的图片，并补齐仍在等待的页面。",
    });
  } else if (imageDelivery === "dynamic-fallback") {
    items.push({
      tone: "info",
      label: "真实图片暂未命中，当前使用动态剧情插画",
      detail: diagnostics?.image?.lastErrorReason
        ? `${formatWarmProgressDetail(diagnostics.image)}`
        : "当前页面先展示动态剧情插画，方便继续预览绘本内容。",
    });
  } else if (imageDelivery === "demo-art") {
    items.push({
      tone: "info",
      label: "当前使用演示插画",
      detail: "仅在其他插画暂未就绪时，才会使用这一层演示资源。",
    });
  } else {
    items.push({
      tone: "warning",
      label: "插画暂未就绪，当前使用基础插画",
      detail: "当前页面先保留基础插画，方便继续预览内容。",
    });
  }

  if (diagnostics?.audio?.jobStatus === "warming") {
    items.push({
      tone: "info",
      label: "真实逐页朗读补齐中",
      detail: formatWarmProgressDetail(diagnostics.audio),
    });
  } else if (audioDelivery === "real") {
    items.push({
      tone: "success",
      label: "真实逐页朗读已就绪",
      detail: "每页将优先播放后端生成的真实音频。",
    });
  } else if (audioDelivery === "mixed") {
    items.push({
      tone: "info",
      label: canUseLocalSpeech ? "部分真实朗读，缺页将使用本地补读" : "部分真实朗读，缺页将使用字幕预演",
      detail: canUseLocalSpeech
        ? "未命中的页会切到浏览器本地补读。"
        : "未命中的页会切到字幕预演。",
    });
  } else {
    items.push({
      tone: "warning",
      label: canUseLocalSpeech
        ? "后端真实朗读未命中，当前为本地补读"
        : "后端真实朗读未命中，当前仅字幕预演",
      detail: canUseLocalSpeech
        ? "浏览器 speechSynthesis 可用，但当前听到的不是后端真实 TTS。"
        : "当前浏览器不支持本地朗读，只能进行字幕预演。",
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSceneImageDeliveryLabel(scene: ParentStoryBookScene) {
  return formatStoryBookSceneImageDelivery(
    getRuntimeSceneImageDelivery(scene as StoryBookRuntimeScene)
  );
}

function getRuntimePlaybackActionText(
  scene: ParentStoryBookScene,
  playbackSource: PlaybackSource,
  isPlaying: boolean,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  void canUseLocalSpeech;
  if (isPlaying && playbackSource === "real") {
    if (playbackState === "paused" && isPlaying) return "继续朗读";
    if (isPlaying) return "暂停朗读";
    return "播放朗读";
  }
  if (isPlaying && playbackSource === "local") {
    if (playbackState === "paused" && isPlaying) return "继续本地补读";
    if (playbackState === "local" && isPlaying) return "暂停本地补读";
    return "本地补读";
  }
  if (scene.audioStatus === "ready" && scene.audioUrl) {
    return "播放朗读";
  }
  if (canUseLocalSpeech) {
    return "本地补读";
  }
  if (playbackState === "preview") {
    return isPlaying ? "停止预演" : "字幕预演";
  }
  return isPlaying ? "停止预演" : "字幕预演";
}

function getRuntimeCaptionStatusText(
  playbackSource: PlaybackSource,
  isPlaying: boolean,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  void canUseLocalSpeech;
  if (playbackSource === "real") {
    if (playbackState === "loading" && isPlaying) return "正在加载真实朗读";
    if (playbackState === "paused" && isPlaying) return "真实朗读已暂停";
    if (isPlaying) return "真实朗读播放中";
    return "真实朗读已就绪";
  }
  if (playbackSource === "local") {
    if (playbackState === "loading" && isPlaying) return "正在准备本地补读";
    if (playbackState === "paused" && isPlaying) return "本地补读已暂停";
    if (isPlaying) return "本地补读播放中";
    return "后端真实朗读未命中，当前使用本地补读";
  }
  if (playbackState === "preview") {
    return isPlaying ? "当前仅在进行字幕预演" : "当前仅字幕预演，未生成真实音频";
  }
  return isPlaying ? "当前仅在进行字幕预演" : "当前仅字幕预演，未生成真实音频";
}

function getRuntimePlaybackTimeLabel(
  playbackSource: PlaybackSource,
  isSceneActive: boolean,
  currentTime: number,
  duration: number,
  canUseLocalSpeech: boolean,
  playbackState: PlaybackState
) {
  void canUseLocalSpeech;
  if (isSceneActive && duration > 0) {
    return `${formatSeconds(currentTime)} / ${formatSeconds(duration)}`;
  }
  if (playbackSource === "real") return "可播放";
  if (playbackState === "preview") return "仅字幕预演";
  if (playbackSource === "local") return playbackState === "local" ? "本地补读" : "可本地补读";
  return "仅字幕预演";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRuntimeSceneAudioBadgeLabel(
  scene: ParentStoryBookScene,
  playbackSource: PlaybackSource,
  isSceneActive: boolean,
  canUseLocalSpeech: boolean
) {
  void canUseLocalSpeech;
  if (isSceneActive) {
    if (playbackSource === "real") return "真实朗读";
    if (playbackSource === "local") return "本地补读";
  } else if (scene.audioStatus === "ready" && scene.audioUrl) {
    return "真实朗读";
  }
  return "字幕预演";
}

function getRuntimeSceneAudioPlayingLabel(
  playbackSource: PlaybackSource,
  playbackState: PlaybackState,
  canUseLocalSpeech: boolean
) {
  void canUseLocalSpeech;
  if (playbackSource === "real") {
    if (playbackState === "paused") return "真实朗读已暂停";
    return "真实朗读中";
  }
  if (playbackSource === "local") {
    if (playbackState === "paused") return "本地补读已暂停";
    return "本地补读中";
  }
  return "字幕预演中";
}

function getSceneImageFallbackKeyHotfix(storyId: string, sceneIndex: number) {
  return `${storyId}:${sceneIndex}`;
}

function normalizeImageDeliveryHotfix(
  value?: StoryBookRuntimeImageDelivery | "mixed" | "real"
): Exclude<StoryBookPublicImageDelivery, "mixed"> {
  if (value === "real") return "real";
  if (value === "svg-fallback") return "svg-fallback";
  return "dynamic-fallback";
}

export function resolveRuntimeSceneImageDeliveryHotfix(
  scene: StoryBookRuntimeScene,
  options?: { useAssetFallback?: boolean }
): Exclude<StoryBookPublicImageDelivery, "mixed"> {
  if (options?.useAssetFallback) {
    return scene.assetRef && scene.assetRef !== scene.imageUrl
      ? "dynamic-fallback"
      : "svg-fallback";
  }
  if (scene.imageSourceKind) return normalizeImageDeliveryHotfix(scene.imageSourceKind);
  if (scene.imageStatus === "ready") return "real";
  if (scene.imageStatus === "fallback" && (scene.imageUrl || scene.assetRef)) {
    return "dynamic-fallback";
  }
  return "svg-fallback";
}

function resolveRuntimeImageDeliveryHotfix(
  story: StoryBookRuntimeResponse,
  imageFallbackMap: Record<string, boolean> = {}
): StoryBookPublicImageDelivery {
  const imageDeliveries = story.scenes.map((scene) =>
    resolveRuntimeSceneImageDeliveryHotfix(scene, {
      useAssetFallback: Boolean(
        imageFallbackMap[getSceneImageFallbackKeyHotfix(story.storyId, scene.sceneIndex)] &&
          scene.assetRef &&
          scene.assetRef !== scene.imageUrl
      ),
    })
  );
  const uniqueDeliveries = [...new Set(imageDeliveries)];
  if (uniqueDeliveries.length === 0) return "svg-fallback";
  if (uniqueDeliveries.length === 1) return uniqueDeliveries[0];
  return uniqueDeliveries.includes("real") ? "mixed" : uniqueDeliveries[0];
}

function sceneHasReadyAudioHotfix(
  scene: Pick<ParentStoryBookScene, "audioStatus" | "audioUrl"> | null | undefined
) {
  return Boolean(scene?.audioStatus === "ready" && scene.audioUrl);
}

function normalizeRuntimeAudioDeliveryHotfix(
  audioDelivery?: StoryBookAudioDelivery
): Exclude<StoryBookRuntimeAudioDelivery, "local-speech"> {
  if (
    audioDelivery === "real" ||
    audioDelivery === "stream-url" ||
    audioDelivery === "inline-data-url"
  ) {
    return "real";
  }
  if (audioDelivery === "mixed") {
    return "mixed";
  }
  return "preview-only";
}

export function resolveRuntimeAudioDeliveryHotfix(
  story: StoryBookRuntimeResponse | null | undefined
): Exclude<StoryBookRuntimeAudioDelivery, "local-speech"> {
  if (!story) return "preview-only";
  return normalizeRuntimeAudioDeliveryHotfix(
    story.providerMeta.audioDelivery ?? story.cacheMeta?.audioDelivery
  );
}

export function resolveLocalSpeechHandoffSceneIndexHotfix(
  story: StoryBookRuntimeResponse | null | undefined,
  playbackSource: PlaybackSource,
  playbackSceneIndex: number | null
) {
  if (!story || playbackSource !== "local" || playbackSceneIndex === null) {
    return null;
  }
  return sceneHasReadyAudioHotfix(story.scenes[playbackSceneIndex])
    ? playbackSceneIndex
    : null;
}

export function resolveRuntimeStoryStateHotfix(
  story: StoryBookRuntimeResponse | null | undefined,
  options?: StoryBookRuntimeOverrides
): StoryBookResolvedRuntimeState {
  if (!story) {
    return {
      imageDelivery: "svg-fallback",
      audioDelivery: "preview-only",
      mode: "fallback",
    };
  }

  const imageDelivery = resolveRuntimeImageDeliveryHotfix(story, options?.imageFallbackMap);
  const audioDelivery = resolveRuntimeAudioDeliveryHotfix(story);
  if (imageDelivery === "real" && audioDelivery === "real") {
    return { imageDelivery, audioDelivery, mode: "live" };
  }
  if (imageDelivery === "mixed" || imageDelivery === "real" || audioDelivery === "mixed") {
    return { imageDelivery, audioDelivery, mode: "mixed" };
  }
  return { imageDelivery, audioDelivery, mode: "fallback" };
}

export function resolveRuntimeStoryModeHotfix(
  story: StoryBookRuntimeResponse | null | undefined,
  options?: StoryBookRuntimeOverrides
) {
  return resolveRuntimeStoryStateHotfix(story, options).mode;
}

function getStoryAudioRuntimeLabelHotfix(
  audioDelivery?: StoryBookRuntimeAudioDelivery | StoryBookAudioDelivery,
  canUseLocalSpeech = false
) {
  if (audioDelivery === "local-speech") {
    return "可用本机朗读";
  }
  if (audioDelivery === "real" || audioDelivery === "stream-url" || audioDelivery === "inline-data-url") {
    return "可播放整本朗读";
  }
  if (audioDelivery === "mixed") {
    return canUseLocalSpeech ? "部分页面可朗读" : "部分页面带朗读";
  }
  return canUseLocalSpeech
    ? "当前先用本机朗读"
    : "当前先看字幕版";
}

export function getRuntimeBannerItemsHotfix(
  story: StoryBookRuntimeResponse | null | undefined,
  canUseLocalSpeech: boolean,
  runtimeOverrides?: Omit<StoryBookRuntimeOverrides, "canUseLocalSpeech">
) {
  if (!story) return [];

  const items: Array<{ tone: "warning" | "success" | "info"; label: string; detail: string }> = [];
  const diagnostics = story.providerMeta.diagnostics;
  const transport = story.providerMeta.transport;
  const runtimeState = resolveRuntimeStoryStateHotfix(story, {
    ...runtimeOverrides,
    canUseLocalSpeech,
  });
  const imageDelivery = runtimeState.imageDelivery;
  const audioDelivery = resolveRuntimeAudioDeliveryHotfix(story);
  const isPlayingLocalFallback = runtimeOverrides?.playbackSource === "local";
  if (transport === "remote-brain-proxy") {
    items.push({
      tone: "success",
      label: "今天的成长故事已生成",
      detail: "当前看到的是按今天成长线索整理好的版本。",
    });
  } else if (diagnostics?.brain?.reachable === false || transport === "next-json-fallback") {
    items.push({
      tone: "warning",
      label: "先为你展示可直接阅读的版本",
      detail: diagnostics?.brain?.fallbackReason
        ? formatStoryBookFallbackReason(diagnostics.brain.fallbackReason)
        : "实时补全还在继续，这一版已经可以先读先听。",
    });
  } else {
    items.push({
      tone: "info",
      label: "故事版本已准备好",
      detail: "如果稍后有更完整的资源，页面会继续补齐。",
    });
  }

  if (diagnostics?.image?.jobStatus === "warming") {
    items.push({
      tone: "info",
      label: "插画继续补齐中",
      detail: "当前先保留可阅读的插画版本。",
    });
  }

  if (imageDelivery === "real") {
    items.push({
      tone: "success",
      label: "整本插画已准备好",
      detail: "每一页都能看到完整插画。",
    });
  } else if (imageDelivery === "mixed") {
    items.push({
      tone: "info",
      label: "部分页面已换成正式插画",
      detail: "其余页面先保留可阅读版本，不影响继续看故事。",
    });
  } else if (imageDelivery === "dynamic-fallback") {
    items.push({
      tone: "info",
      label: "当前先看故事插画版",
      detail: "插画会继续按故事内容补齐，现在这一版已经可以阅读。",
    });
  } else {
    items.push({
      tone: "warning",
      label: "当前先保留基础插画",
      detail: "故事内容已准备好，插画资源会继续补齐。",
    });
  }

  if (diagnostics?.audio?.jobStatus === "warming") {
    items.push({
      tone: "info",
      label: "朗读资源继续补齐中",
      detail: "现在已经可以先看字幕版或使用本机朗读。",
    });
  }

  if (audioDelivery === "real") {
    items.push({
      tone: "success",
      label: "整本可直接播放朗读",
      detail: "每一页都会优先播放可用朗读。",
    });
  } else if (audioDelivery === "mixed") {
    items.push({
      tone: "info",
      label: "部分页面已带朗读",
      detail: canUseLocalSpeech
        ? "其余页面会自动切到本机朗读。"
        : "其余页面先保留字幕版。",
    });
  } else if (isPlayingLocalFallback) {
    items.push({
      tone: "warning",
      label: "当前使用本机朗读",
      detail: "这台设备会直接帮你把这一页读出来。",
    });
  } else {
    items.push({
      tone: "warning",
      label: "当前先看字幕版",
      detail: "朗读资源还在补齐，先不影响阅读故事。",
    });
  }

  return items;
}

function getSceneImageDeliveryLabelHotfix(
  scene: StoryBookRuntimeScene,
  options?: { useAssetFallback?: boolean }
) {
  return formatStoryBookSceneImageDelivery(
    resolveRuntimeSceneImageDeliveryHotfix(scene, options)
  );
}

function resolveRuntimeSceneAudioDeliveryHotfix(
  scene: ParentStoryBookScene,
  {
    playbackSource,
    isSceneActive,
    canUseLocalSpeech,
  }: {
    playbackSource: PlaybackSource;
    isSceneActive: boolean;
    canUseLocalSpeech: boolean;
  }
): StoryBookRuntimeAudioDelivery {
  if (isSceneActive && playbackSource === "real") return "real";
  if (isSceneActive && playbackSource === "local") return "local-speech";
  if (sceneHasReadyAudioHotfix(scene)) return "real";
  return canUseLocalSpeech ? "local-speech" : "preview-only";
}

function getRuntimeSceneAudioBadgeLabelHotfix(
  scene: ParentStoryBookScene,
  playbackSource: PlaybackSource,
  isSceneActive: boolean,
  canUseLocalSpeech: boolean
) {
  const audioDelivery = resolveRuntimeSceneAudioDeliveryHotfix(scene, {
    playbackSource,
    isSceneActive,
    canUseLocalSpeech,
  });
  if (audioDelivery === "real") return "真实朗读";
  if (audioDelivery === "local-speech") return "本机朗读";
  return "字幕版";
}

export default function StoryBookViewer({
  status,
  story,
  errorMessage,
  refreshMessage,
  cacheState,
  isRefreshing = false,
  selectedChildName,
  hasChildContext,
  generationMode,
  manualTheme,
  pageCount,
  selectedPresetId,
  styleMode,
  customStylePrompt,
  customStyleNegativePrompt,
  themeChips,
  pageCountOptions,
  generationHint,
  canGenerate,
  onSelectPreset,
  onGenerationModeChange,
  onManualThemeChange,
  onSelectThemeChip,
  onPageCountChange,
  onStyleModeChange,
  onCustomStylePromptChange,
  onCustomStyleNegativePromptChange,
  onGenerate,
  onRetry,
  parentHref = "/parent",
}: {
  status: StoryBookViewerStatus;
  story?: ParentStoryBookResponse | null;
  errorMessage?: string | null;
  refreshMessage?: string | null;
  cacheState?: { kind: "none" | "hit" | "saved"; savedAt?: number };
  isRefreshing?: boolean;
  selectedChildName?: string;
  hasChildContext: boolean;
  generationMode: ParentStoryBookGenerationMode;
  manualTheme: string;
  pageCount: ParentStoryBookPageCount;
  selectedPresetId: ParentStoryBookStylePreset;
  styleMode: ParentStoryBookStyleMode;
  customStylePrompt: string;
  customStyleNegativePrompt: string;
  themeChips: string[];
  pageCountOptions: ParentStoryBookPageCount[];
  generationHint?: string | null;
  canGenerate: boolean;
  onSelectPreset: (preset: ParentStoryBookStylePreset) => void;
  onGenerationModeChange: (mode: ParentStoryBookGenerationMode) => void;
  onManualThemeChange: (value: string) => void;
  onSelectThemeChip: (theme: string) => void;
  onPageCountChange: (count: ParentStoryBookPageCount) => void;
  onStyleModeChange: (mode: ParentStoryBookStyleMode) => void;
  onCustomStylePromptChange: (value: string) => void;
  onCustomStyleNegativePromptChange: (value: string) => void;
  onGenerate: () => void;
  onRetry?: () => void;
  parentHref?: string;
}) {
  const theme = getTheme(story?.stylePreset ?? selectedPresetId);
  const runtimeStory = story ? getRuntimeStory(story) : null;
  const selectedThemeChip = themeChips.includes(manualTheme.trim()) ? manualTheme.trim() : null;
  const requiresTheme =
    generationMode === "manual-theme" || generationMode === "hybrid";
  const canUseLocalSpeech =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.speechSynthesis?.speak === "function";
  const [sceneRuntimeState, setSceneRuntimeState] = useState<StoryBookSceneRuntimeState>({
    storyId: story?.storyId ?? null,
    playbackSource: "preview",
    playbackSceneIndex: null,
    imageFallbackMap: {},
  });
  const activeSceneRuntimeState =
    sceneRuntimeState.storyId === (story?.storyId ?? null)
      ? sceneRuntimeState
      : {
          storyId: story?.storyId ?? null,
          playbackSource: "preview" as const,
          playbackSceneIndex: null,
          imageFallbackMap: {},
        };

  const runtimeState = runtimeStory
    ? resolveRuntimeStoryStateHotfix(runtimeStory, {
        canUseLocalSpeech,
        playbackSource: activeSceneRuntimeState.playbackSource,
        playbackSceneIndex: activeSceneRuntimeState.playbackSceneIndex,
        imageFallbackMap: activeSceneRuntimeState.imageFallbackMap,
      })
    : null;
  const modeCopy = runtimeState
    ? describeStoryBookMode(runtimeState.mode)
    : null;
  const runtimeBanners = story
    ? getRuntimeBannerItemsHotfix(runtimeStory, canUseLocalSpeech, {
        playbackSource: activeSceneRuntimeState.playbackSource,
        playbackSceneIndex: activeSceneRuntimeState.playbackSceneIndex,
        imageFallbackMap: activeSceneRuntimeState.imageFallbackMap,
      })
    : [];

  const bodyContent = !story ? (
    <EmptyStoryState
      status={status}
      errorMessage={errorMessage}
      onRetry={onRetry}
      parentHref={parentHref}
      quietClass={theme.quiet}
      accentClass={theme.accent}
    />
  ) : (
    <StoryBookSceneStream
      key={story.storyId}
      story={story}
      theme={theme}
      onRuntimeStateChange={setSceneRuntimeState}
    />
  );

  return (
    <div className={cn("min-h-[100svh] px-4 py-4 sm:px-6 sm:py-6", theme.page)}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            className={cn("rounded-full shadow-sm", theme.quiet)}
          >
            <StoryBookLink href={parentHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回家长首页
            </StoryBookLink>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="info">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              成长绘本 Agent V2
            </Badge>
            {modeCopy ? (
              <Badge variant={modeCopy.badgeVariant}>
                <Radio className="mr-1.5 h-3.5 w-3.5" />
                {modeCopy.label}
              </Badge>
            ) : null}
          </div>
        </div>

        <Card className={cn("overflow-hidden backdrop-blur-xl", theme.panel)}>
          {story ? (
            <div className="space-y-2 border-b border-white/70 bg-white/60 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap gap-2">
                {runtimeBanners.map((item) => (
                  <Badge
                    key={item.label}
                    variant={
                      item.tone === "success"
                        ? "success"
                        : item.tone === "info"
                          ? "info"
                          : "warning"
                    }
                    className="px-3 py-1"
                  >
                    {item.label}
                  </Badge>
                ))}
              </div>
              {runtimeBanners[0]?.detail ? (
                <p className="text-xs leading-6 text-slate-500">
                  {runtimeBanners[0].detail}
                </p>
              ) : null}
            </div>
          ) : null}
          <CardHeader className="space-y-4 pb-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl tracking-tight text-slate-950">
                {story?.title ?? "Parent Storybook V2"}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                {story?.summary ??
                  "把孩子的成长线索、家长反馈和教育主题，讲成一部图文音一体、移动端优先的成长绘本。"}
              </CardDescription>
            </div>

            <div className="rounded-[30px] border border-white/70 bg-white/68 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {getGenerationModeCopy(generationMode).label}
                </Badge>
                <Badge variant="outline">页数 {pageCount}</Badge>
                {selectedChildName ? (
                  <Badge variant="secondary">当前孩子：{selectedChildName}</Badge>
                ) : (
                  <Badge variant="warning">当前未选择孩子</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                {getGenerationModeCopy(generationMode).description}
              </p>

              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    生成模式
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["child-personalized", "个性化"],
                        ["manual-theme", "主题"],
                        ["hybrid", "混合"],
                      ] as const
                    ).map(([value, label]) => {
                      const disabled = value !== "manual-theme" && !hasChildContext;
                      const selected = generationMode === value;
                      return (
                        <Button
                          key={value}
                          type="button"
                          variant={selected ? "default" : "outline"}
                          className={cn("rounded-full", selected ? theme.accent : theme.quiet)}
                          disabled={disabled}
                          onClick={() => onGenerationModeChange(value)}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {requiresTheme ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        快捷主题
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {themeChips.map((themeLabel) => (
                          <button
                            key={themeLabel}
                            type="button"
                            onClick={() => onSelectThemeChip(themeLabel)}
                            className={cn(
                              "rounded-full border px-3 py-2 text-sm transition-all",
                              selectedThemeChip === themeLabel
                                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                : "border-white/60 bg-white/75 text-slate-700 hover:bg-white"
                            )}
                          >
                            {themeLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        主题输入
                      </p>
                      <Input
                        value={manualTheme}
                        onChange={(event) => onManualThemeChange(event.target.value)}
                        placeholder="例如：表达情绪、独立入睡、勇敢尝试"
                        className="h-11 rounded-2xl border-white/70 bg-white/88 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    页数切换
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pageCountOptions.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={pageCount === value ? "default" : "outline"}
                        className={cn("rounded-full", pageCount === value ? theme.accent : theme.quiet)}
                        onClick={() => onPageCountChange(value)}
                      >
                        {value} 页
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      风格模式
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["preset", "预设风格"],
                          ["custom", "自定义风格"],
                        ] as const
                      ).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={styleMode === value ? "default" : "outline"}
                          className={cn("rounded-full", styleMode === value ? theme.accent : theme.quiet)}
                          onClick={() => onStyleModeChange(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {styleMode === "custom" ? (
                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          自定义风格
                        </p>
                        <Input
                          value={customStylePrompt}
                          onChange={(event) => onCustomStylePromptChange(event.target.value)}
                          placeholder="例如：梦幻3D儿童绘本、柔焦、低饱和、电影级光影、浅景深"
                          className="h-11 rounded-2xl border-white/70 bg-white/88 text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          负面约束
                        </p>
                        <Input
                          value={customStyleNegativePrompt}
                          onChange={(event) => onCustomStyleNegativePromptChange(event.target.value)}
                          placeholder="例如：不要照片感、不要复杂背景、不要写实人脸、不要过度文字"
                          className="h-11 rounded-2xl border-white/70 bg-white/88 text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    风格预设
                  </p>
                  {styleMode === "preset" ? (
                    <div className="flex flex-wrap gap-2">
                      {PARENT_STORYBOOK_PRESETS.map((item) => {
                        const presetCopy = getStoryBookPresetCopy(item.id);
                        const selected = item.id === selectedPresetId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectPreset(item.id)}
                            className={cn(
                              "rounded-2xl border px-3 py-2 text-left text-sm transition-all",
                              selected
                                ? "border-slate-900 bg-white text-slate-950 shadow-sm"
                                : "border-white/60 bg-white/65 text-slate-600"
                            )}
                          >
                            <div className="font-semibold">{presetCopy.shortLabel}</div>
                            <div className="mt-1 text-xs opacity-80">
                              {presetCopy.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-600">
                      当前使用自定义风格；预设仅作为切回 preset 时的记忆值，不会混入这次插画 prompt。
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/70 bg-white/72 px-4 py-3">
                  <div className="text-sm text-slate-600">
                    {generationHint ? generationHint : "参数调整完成后，点击重新生成应用到整本绘本。"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {story && onRetry ? (
                      <Button
                        type="button"
                        variant="outline"
                        className={cn("rounded-full", theme.quiet)}
                        onClick={onRetry}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        刷新当前版本
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      className={cn("rounded-full shadow-sm", theme.accent)}
                      disabled={!canGenerate}
                      onClick={onGenerate}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      重新生成
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {refreshMessage ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
                {refreshMessage}
              </div>
            ) : null}
            {isRefreshing ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在刷新绘本资源，当前先保留上一版内容。
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-5 pb-6">
            {bodyContent}

            {story ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className={cn("border-white/70", theme.panel)}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2">
                      {modeCopy ? (
                        <Badge variant={modeCopy.badgeVariant}>{modeCopy.label}</Badge>
                      ) : null}
                      <Badge variant="outline">分镜 {story.providerMeta.sceneCount}</Badge>
                      <Badge variant="outline">亮点 {story.providerMeta.highlightCount}</Badge>
                    </div>
                    <p className="text-sm leading-7 text-slate-600">
                      {modeCopy?.summary}
                    </p>
                    <p className="text-sm leading-7 text-slate-600">
                      收束提示：{story.parentNote}
                    </p>
                  </CardContent>
                </Card>

                <Card className={cn("border-white/70", theme.panel)}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {getStoryAudioRuntimeLabelHotfix(
                          runtimeState?.audioDelivery ??
                            story.providerMeta.audioDelivery ??
                            story.cacheMeta?.audioDelivery,
                          canUseLocalSpeech
                        )}
                      </Badge>
                      <Badge variant="outline">
                        {formatStoryBookResponseCache(story.cacheMeta?.storyResponse)}
                      </Badge>
                      {cacheState && cacheState.kind !== "none" ? (
                        <Badge variant="outline">
                          {formatStoryBookClientCache(cacheState.kind)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm leading-7 text-slate-600">
                      画风：{getStoryBookPresetCopy(story.stylePreset ?? selectedPresetId).label}
                    </p>
                    <p className="text-sm leading-7 text-slate-600">
                      来源：{formatStoryBookHighlightSource(story.scenes[0]?.highlightSource)}
                    </p>
                    <p className="text-sm leading-7 text-slate-600">
                      朗读方式：{getStoryAudioRuntimeLabelHotfix(
                        runtimeState?.audioDelivery ??
                          story.providerMeta.audioDelivery ??
                          story.cacheMeta?.audioDelivery,
                        canUseLocalSpeech
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StoryBookSceneStream({
  story,
  theme,
  onRuntimeStateChange,
}: {
  story: ParentStoryBookResponse;
  theme: StoryBookTheme;
  onRuntimeStateChange?: (state: StoryBookSceneRuntimeState) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const queueRef = useRef<number[]>([]);
  const sceneRefs = useRef<Record<number, HTMLElement | null>>({});
  const tokenRef = useRef(0);
  const scenesRef = useRef<ParentStoryBookScene[]>([]);
  const autoHandoffAttemptRef = useRef<string | null>(null);
  const startAudioRef = useRef<
    (scene: ParentStoryBookScene, index: number, options?: ScenePlaybackOptions) => void
  >(() => {});
  const startScenePlaybackRef = useRef<
    (scene: ParentStoryBookScene, index: number, options?: ScenePlaybackOptions) => void
  >(() => {});

  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>("preview");
  const [playbackSceneIndex, setPlaybackSceneIndex] = useState<number | null>(null);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBookPlaying, setIsBookPlaying] = useState(false);
  const [imageFallbackMap, setImageFallbackMap] = useState<Record<string, boolean>>({});
  const canUseLocalSpeech =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.speechSynthesis?.speak === "function";

  const scenes = useMemo(() => story.scenes ?? [], [story.scenes]);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    onRuntimeStateChange?.({
      storyId: story.storyId,
      playbackSource,
      playbackSceneIndex,
      imageFallbackMap,
    });
  }, [imageFallbackMap, onRuntimeStateChange, playbackSceneIndex, playbackSource, story.storyId]);

  function invalidate() {
    tokenRef.current += 1;
    return tokenRef.current;
  }

  function clearPreview() {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }

  function clearSpeech() {
    const speech = window.speechSynthesis;
    if (speech) {
      speech.cancel();
    }
    speechRef.current = null;
  }

  function clearAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.onloadedmetadata = null;
    audio.onplaying = null;
    audio.onpause = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
    audioRef.current = null;
  }

  function stopPlayback() {
    invalidate();
    queueRef.current = [];
    autoHandoffAttemptRef.current = null;
    clearPreview();
    clearSpeech();
    clearAudio();
    setPlaybackState("idle");
    setPlaybackSource("preview");
    setPlaybackSceneIndex(null);
    setCaptionIndex(0);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setIsBookPlaying(false);
  }

  function scrollToScene(index: number) {
    sceneRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setActiveIndex(index);
  }

  useEffect(() => {
    return () => {
      invalidate();
      clearPreview();
      clearAudio();
    };
  }, []);

  useEffect(() => {
    if (!scenes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visibleEntry) return;
        const index = Number(visibleEntry.target.getAttribute("data-scene-index"));
        if (!Number.isNaN(index)) {
          setActiveIndex(index);
        }
      },
      {
        root: null,
        threshold: [0.35, 0.55, 0.8],
        rootMargin: "-12% 0px -24% 0px",
      }
    );

    scenes.forEach((_, index) => {
      const node = sceneRefs.current[index];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [scenes]);

  function advanceQueue() {
    const nextIndex = queueRef.current.shift();
    if (nextIndex === undefined) {
      stopPlayback();
      return;
    }
    const nextScene = scenesRef.current[nextIndex];
    if (!nextScene) {
      stopPlayback();
      return;
    }
    startScenePlaybackRef.current(nextScene, nextIndex, { continueBook: true });
  }

  function startCaptionTimelineLoop(
    timeline: CaptionTimeline,
    token: number,
    options?: { continueBook?: boolean; advanceOnTimer?: boolean }
  ) {
    clearPreview();

    if (!timeline.segments.length) {
      previewTimerRef.current = window.setTimeout(() => {
        if (tokenRef.current !== token) return;
        if (options?.advanceOnTimer !== false) {
          advanceQueue();
        }
      }, 0);
      return;
    }

    let step = 0;
    const tick = () => {
      if (tokenRef.current !== token) return;

      if (step >= timeline.segments.length) {
        setCaptionIndex(Math.max(timeline.segments.length - 1, 0));
        setProgress(1);
        setCurrentTime(timeline.totalDurationMs / 1000);
        clearPreview();
        if (options?.advanceOnTimer !== false) {
          advanceQueue();
        }
        return;
      }

      const nextStartMs = timeline.startsMs[step] ?? 0;
      setCaptionIndex(step);
      setProgress(
        timeline.totalDurationMs > 0
          ? Math.min(nextStartMs / timeline.totalDurationMs, 1)
          : 1
      );
      setCurrentTime(nextStartMs / 1000);
      const delayMs = timeline.durationsMs[step] ?? buildCaptionDurationMs(timeline.segments[step]);
      step += 1;
      previewTimerRef.current = window.setTimeout(tick, Math.max(0, delayMs));
    };

    previewTimerRef.current = window.setTimeout(tick, 0);
  }

  function startCaptionTrack(
    scene: ParentStoryBookScene,
    index: number,
    options?: { continueBook?: boolean; advanceOnTimer?: boolean },
    playbackMode: "preview" | "local" = "preview"
  ) {
    const token = invalidate();
    clearSpeech();
    clearAudio();
    clearPreview();

    const timeline = buildCaptionTimeline(scene);
    const safeSegments =
      timeline.segments.length > 0
        ? timeline.segments
        : [scene.audioScript || scene.sceneText].filter(Boolean);
    const totalDurationMs =
      timeline.totalDurationMs || safeSegments.length * PREVIEW_MIN_SEGMENT_MS;
    const totalDuration = totalDurationMs / 1000;

    setPlaybackSceneIndex(index);
    setPlaybackState(playbackMode);
    setPlaybackSource(playbackMode);
    setCaptionIndex(0);
    setProgress(0);
    setCurrentTime(0);
    setDuration(totalDuration);
    setIsBookPlaying(Boolean(options?.continueBook || queueRef.current.length));
    scrollToScene(index);

    if (playbackMode === "preview") {
      startCaptionTimelineLoop(timeline, token, options);
    }

    return { token, timeline, safeSegments, totalDuration };
  }

  function startPreview(
    scene: ParentStoryBookScene,
    index: number,
    options?: { continueBook?: boolean }
  ) {
    startCaptionTrack(scene, index, options, "preview");
  }

  function startLocalSpeech(
    scene: ParentStoryBookScene,
    index: number,
    options?: ScenePlaybackOptions
  ) {
    if (!canUseLocalSpeech || typeof window === "undefined" || !window.speechSynthesis) {
      startPreview(scene, index, options);
      return;
    }

    const { token } = startCaptionTrack(
      scene,
      index,
      { ...options, advanceOnTimer: false },
      "local"
    );
    const timeline = buildCaptionTimeline(scene);
    const speech = window.speechSynthesis;
    const utteranceText = scene.audioScript || scene.sceneText;
    const utterance = new SpeechSynthesisUtterance(utteranceText);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    speechRef.current = utterance;
    let sawBoundary = false;
    const boundaryRanges = timeline.ranges;

    utterance.onstart = () => {
      if (tokenRef.current !== token) return;
      setPlaybackState("local");
      startCaptionTimelineLoop(timeline, token, { ...options, advanceOnTimer: false });
    };
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (tokenRef.current !== token) return;
      const charIndex = Number(event.charIndex);
      if (!Number.isFinite(charIndex)) return;
      if (!sawBoundary) {
        sawBoundary = true;
        clearPreview();
      }
      const nextCaption = getCaptionIndexForCharIndex(
        { ...timeline, ranges: boundaryRanges },
        Math.max(0, charIndex)
      );
      setCaptionIndex(nextCaption);
      const nextStartMs = timeline.startsMs[nextCaption] ?? 0;
      setProgress(
        timeline.totalDurationMs > 0
          ? Math.min(nextStartMs / timeline.totalDurationMs, 1)
          : 1
      );
      setCurrentTime(nextStartMs / 1000);
      setDuration(timeline.totalDurationMs / 1000);
    };
    utterance.onpause = () => {
      if (tokenRef.current !== token) return;
      setPlaybackState("paused");
      if (!queueRef.current.length) {
        setIsBookPlaying(false);
      }
    };
    utterance.onresume = () => {
      if (tokenRef.current !== token) return;
      setPlaybackState("local");
    };
    utterance.onerror = () => {
      if (tokenRef.current !== token) return;
      clearPreview();
      startPreview(scene, index, options);
    };
    utterance.onend = () => {
      if (tokenRef.current !== token) return;
      clearPreview();
      clearSpeech();
      advanceQueue();
    };

    speech.cancel();
    speech.speak(utterance);
  }

  function startAudio(
    scene: ParentStoryBookScene,
    index: number,
    options?: ScenePlaybackOptions
  ) {
    if (!scene.audioUrl) {
      startPreview(scene, index, options);
      return;
    }

    const token = invalidate();
    clearSpeech();
    clearPreview();
    clearAudio();

    const audio = new Audio(scene.audioUrl);
    const timeline = buildCaptionTimeline(scene);
    const safeSegments =
      timeline.segments.length > 0
        ? timeline.segments
        : [scene.audioScript || scene.sceneText].filter(Boolean);
    audioRef.current = audio;
    setPlaybackSceneIndex(index);
    setPlaybackState("loading");
    setPlaybackSource("real");
    setCaptionIndex(0);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setIsBookPlaying(Boolean(options?.continueBook || queueRef.current.length));
    scrollToScene(index);

    audio.onloadedmetadata = () => {
      if (tokenRef.current !== token) return;
      setDuration(
        Number.isFinite(audio.duration)
          ? audio.duration
          : timeline.totalDurationMs / 1000 || safeSegments.length * PREVIEW_MIN_SEGMENT_MS / 1000
      );
    };
    audio.onplaying = () => {
      if (tokenRef.current !== token) return;
      setPlaybackState("playing");
    };
    audio.onpause = () => {
      if (tokenRef.current !== token || audio.ended) return;
      setPlaybackState("paused");
      if (!queueRef.current.length) {
        setIsBookPlaying(false);
      }
    };
    audio.ontimeupdate = () => {
      if (tokenRef.current !== token) return;
      const safeDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : timeline.totalDurationMs / 1000 || safeSegments.length * PREVIEW_MIN_SEGMENT_MS / 1000;
      const nextProgress = safeDuration > 0 ? Math.min(audio.currentTime / safeDuration, 1) : 0;
      const elapsedMs = nextProgress * timeline.totalDurationMs;
      const nextCaption = getCaptionIndexForElapsedMs(timeline, elapsedMs);
      setDuration(safeDuration);
      setCurrentTime(audio.currentTime);
      setProgress(nextProgress);
      setCaptionIndex(nextCaption);
    };
    audio.onended = () => {
      if (tokenRef.current !== token) return;
      advanceQueue();
    };
    audio.onerror = () => {
      if (tokenRef.current !== token) return;
      if (canUseLocalSpeech) {
        startLocalSpeech(scene, index, options);
        return;
      }
      startPreview(scene, index, options);
    };
    audio.play().catch(() => {
      if (tokenRef.current !== token) return;
      if (canUseLocalSpeech) {
        startLocalSpeech(scene, index, options);
        return;
      }
      startPreview(scene, index, options);
    });
  }

  useEffect(() => {
    startAudioRef.current = startAudio;
  }, [startAudio]);

  useEffect(() => {
    const handoffSceneIndex = resolveLocalSpeechHandoffSceneIndexHotfix(
      story as StoryBookRuntimeResponse,
      playbackSource,
      playbackSceneIndex
    );
    if (handoffSceneIndex === null) {
      autoHandoffAttemptRef.current = null;
      return;
    }

    const handoffScene = scenes[handoffSceneIndex];
    if (!handoffScene || !sceneHasReadyAudioHotfix(handoffScene)) {
      autoHandoffAttemptRef.current = null;
      return;
    }

    const handoffKey = `${story.storyId}:${handoffSceneIndex}:${handoffScene.audioUrl}`;
    if (autoHandoffAttemptRef.current === handoffKey) {
      return;
    }

    autoHandoffAttemptRef.current = handoffKey;
    const continueBook = isBookPlaying || queueRef.current.length > 0;
    startAudioRef.current(
      handoffScene,
      handoffSceneIndex,
      continueBook ? { continueBook: true } : undefined
    );
  }, [isBookPlaying, playbackSceneIndex, playbackSource, scenes, story, story.storyId]);

  function startScenePlayback(
    scene: ParentStoryBookScene,
    index: number,
    options?: ScenePlaybackOptions
  ) {
    if (sceneHasReadyAudioHotfix(scene)) {
      startAudio(scene, index, options);
      return;
    }
    if (canUseLocalSpeech) {
      startLocalSpeech(scene, index, options);
      return;
    }
    startPreview(scene, index, options);
  }

  useEffect(() => {
    startScenePlaybackRef.current = startScenePlayback;
  }, [startScenePlayback]);

  function handlePlayScene(scene: ParentStoryBookScene, index: number) {
    if (playbackSceneIndex === index) {
      queueRef.current = [];
      setIsBookPlaying(false);
      if (playbackState === "playing" || playbackState === "loading") {
        audioRef.current?.pause();
        return;
      }
      if (playbackState === "local") {
        if (speechRef.current) {
          window.speechSynthesis?.pause();
        }
        return;
      }
      if (playbackState === "paused" && audioRef.current) {
        void audioRef.current.play().catch(() => startPreview(scene, index));
        return;
      }
      if (playbackState === "paused" && canUseLocalSpeech) {
        if (speechRef.current) {
          window.speechSynthesis?.resume();
        }
        return;
      }
      if (playbackState === "preview") {
        stopPlayback();
        return;
      }
    }

    queueRef.current = [];
    setIsBookPlaying(false);
    startScenePlayback(scene, index);
  }

  function handlePlayBook() {
    if (!scenes.length) return;
    if (isBookPlaying) {
      stopPlayback();
      return;
    }

    const startIndex = Math.min(activeIndex, scenes.length - 1);
    queueRef.current = scenes
      .map((_, index) => index)
      .filter((index) => index > startIndex);
    startScenePlayback(scenes[startIndex], startIndex, { continueBook: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-[28px] border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Badge variant="info">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            第 {activeIndex + 1} / {scenes.length} 页
          </Badge>
          <Badge variant={story.mode === "card" ? "warning" : "success"}>
            {story.mode === "card" ? "轻量成长卡" : "成长绘本"}
          </Badge>
        </div>
        <Button
          type="button"
          className={cn("rounded-full shadow-sm", theme.accent)}
          onClick={handlePlayBook}
        >
          {isBookPlaying ? (
            <Pause className="mr-2 h-4 w-4" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {getBookPlaybackLabel(
            story.providerMeta.audioDelivery,
            canUseLocalSpeech,
            isBookPlaying
          )}
        </Button>
        <p className="text-xs text-slate-500">
          {getStoryAudioRuntimeLabelHotfix(
            resolveRuntimeAudioDeliveryHotfix(story as StoryBookRuntimeResponse),
            canUseLocalSpeech
          )}
        </p>
      </div>

      <div className="space-y-5">
        {scenes.map((scene, index) => {
          const isPlaying = playbackSceneIndex === index && playbackState !== "idle";
          const isSceneActive = playbackSceneIndex === index;
          const sceneRuntime = scene as StoryBookRuntimeScene;
          const captionTimeline = buildCaptionTimeline(scene);
          const segments = captionTimeline.segments.length
            ? captionTimeline.segments
            : [scene.audioScript || scene.sceneText].filter(Boolean);
          const sceneImageFallbackKey = getSceneImageFallbackKeyHotfix(
            story.storyId,
            scene.sceneIndex
          );
          const useAssetFallback =
            Boolean(imageFallbackMap[sceneImageFallbackKey]) &&
            Boolean(scene.assetRef) &&
            scene.assetRef !== scene.imageUrl;
          const imageDelivery = resolveRuntimeSceneImageDeliveryHotfix(sceneRuntime, {
            useAssetFallback,
          });
          const sceneImageSrc = useAssetFallback
            ? scene.assetRef || "/storybook/card.svg"
            : scene.imageUrl || scene.assetRef || "/storybook/card.svg";
          return (
            <article
              key={scene.sceneIndex}
              ref={(node) => {
                sceneRefs.current[index] = node;
              }}
              data-scene-index={index}
              className={cn(
                "rounded-[34px] border border-white/65 bg-white/84 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] transition-all duration-500 sm:p-5",
                activeIndex === index
                  ? "scale-[1.01] shadow-[0_28px_80px_rgba(15,23,42,0.14)]"
                  : "scale-[0.992] opacity-95"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={activeIndex === index ? "success" : "secondary"}>
                    第 {index + 1} 页
                  </Badge>
                  <Badge variant="outline" className={theme.chip}>
                    {formatStoryBookHighlightSource(scene.highlightSource)}
                  </Badge>
                  {isPlaying ? (
                    <Badge
                      variant={
                        playbackSource === "real"
                          ? "success"
                          : playbackSource === "local"
                            ? "info"
                            : "warning"
                      }
                    >
                      <AudioLines className="mr-1.5 h-3.5 w-3.5" />
                      {getRuntimeSceneAudioPlayingLabel(
                        playbackSource,
                        playbackState,
                        canUseLocalSpeech
                      )}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      imageDelivery === "real"
                        ? "success"
                        : imageDelivery === "dynamic-fallback"
                          ? "info"
                          : "warning"
                    }
                  >
                    {getSceneImageDeliveryLabelHotfix(sceneRuntime, { useAssetFallback })}
                  </Badge>
                  <Badge
                    variant={
                      isSceneActive
                        ? playbackSource === "real"
                          ? "success"
                          : playbackSource === "local"
                            ? "info"
                            : "warning"
                        : scene.audioStatus === "ready" && scene.audioUrl
                          ? "success"
                          : canUseLocalSpeech
                          ? "info"
                          : "warning"
                    }
                  >
                    {getRuntimeSceneAudioBadgeLabelHotfix(
                      scene,
                      playbackSource,
                      isSceneActive,
                      canUseLocalSpeech
                    )}
                  </Badge>
                </div>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-sm">
                <div className="relative aspect-[4/5] w-full sm:aspect-[5/6]">
                  <StoryBookImage
                    src={sceneImageSrc}
                    alt={scene.sceneTitle}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => {
                      if (!scene.assetRef || scene.assetRef === scene.imageUrl) return;
                      setImageFallbackMap((current) => {
                        if (current[sceneImageFallbackKey]) return current;
                        return {
                          ...current,
                          [sceneImageFallbackKey]: true,
                        };
                      });
                    }}
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent px-4 py-4">
                  <p className="text-lg font-semibold tracking-tight text-white">
                    {scene.sceneTitle}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <p className="text-base leading-8 text-slate-700">{scene.sceneText}</p>

                <div className="rounded-[28px] border border-white/70 bg-white/78 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">逐页朗读</p>
                      <p className="mt-1 text-xs leading-6 text-slate-500">
                        {getRuntimeCaptionStatusText(
                          playbackSource,
                          isPlaying,
                          playbackState,
                          canUseLocalSpeech
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("rounded-full", theme.quiet)}
                      onClick={() => handlePlayScene(scene, index)}
                    >
                      {isPlaying && playbackState !== "paused" ? (
                        <Pause className="mr-2 h-4 w-4" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {getRuntimePlaybackActionText(
                        scene,
                        playbackSource,
                        isPlaying,
                        playbackState,
                        canUseLocalSpeech
                      )}
                    </Button>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        theme.progress
                      )}
                      style={{
                        width: `${
                          Math.max(
                            isSceneActive ? progress * 100 : 0,
                            isPlaying ? 8 : 0
                          )
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      <span>{formatStoryBookVoiceStyle(scene.voiceStyle)}</span>
                    <span>
                      {getRuntimePlaybackTimeLabel(
                        playbackSource,
                        isSceneActive,
                        currentTime,
                        duration,
                        canUseLocalSpeech,
                        playbackState
                      )}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(segments.length > 0 ? segments : [scene.sceneText]).map((segment, segmentIndex) => (
                      <span
                        key={`${scene.sceneIndex}-${segmentIndex}`}
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-sm leading-6 transition-all duration-300",
                          isPlaying && segmentIndex === captionIndex
                            ? "border-transparent bg-slate-900 text-white"
                            : "border-white/60 bg-white/70 text-slate-600"
                        )}
                      >
                        {segment}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function EmptyStoryState({
  status,
  errorMessage,
  onRetry,
  parentHref,
  quietClass,
  accentClass,
}: {
  status: StoryBookViewerStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
  parentHref: string;
  quietClass: string;
  accentClass: string;
}) {
  if (status === "loading") {
    return (
      <div className="space-y-4">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="rounded-[30px] border border-white/70 bg-white/80 p-4 shadow-sm"
          >
            <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-4 aspect-[4/5] animate-pulse rounded-[26px] bg-slate-100" />
            <div className="mt-4 h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-red-100 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-xl text-red-900">成长绘本暂时不可用</CardTitle>
          <CardDescription className="leading-7 text-red-700">
            {errorMessage ?? "请稍后重试，或调整参数后再次生成。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className={cn("rounded-full", quietClass)}>
            <StoryBookLink href={parentHref}>返回家长首页</StoryBookLink>
          </Button>
          {onRetry ? (
            <Button type="button" className={cn("rounded-full", accentClass)} onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重试
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/70 bg-white/78">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">先设定这本成长绘本</CardTitle>
        <CardDescription className="leading-7 text-slate-600">
          选择模式、主题、页数和风格后，点击“重新生成”，就会得到一部图文音一体的成长绘本。
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-7 text-slate-600">
        主题模式和混合模式需要先输入主题；如果当前没有可用孩子数据，系统会自动推荐你先用主题模式开始。
      </CardContent>
    </Card>
  );
}
